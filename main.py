import os
import re
import time
import threading
import random
from datetime import datetime, timedelta
import dns.resolver
import requests
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.responses import Response, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import psycopg2
from auth import hash_password, verify_password, create_token, decode_token

BREVO_API_KEY  = os.environ.get("BREVO_API_KEY", "")
BREVO_SENDER   = os.environ.get("BREVO_SENDER", "")

TMDB_API_KEY = "83d9d6d30f6249cd32695476886cf858"
# Where TMDB is reached. Defaults to a Cloudflare Worker proxy so the server does
# NOT need a VPN (api.themoviedb.org is blocked in some regions). The worker runs
# on Cloudflare's edge and forwards /3/... to TMDB — see cloudflare-tmdb-proxy.js.
# Override with TMDB_BASE=https://api.themoviedb.org/3 to hit TMDB directly.
TMDB_BASE = os.environ.get("TMDB_BASE", "https://tmdb.andreykuzn19.workers.dev/3")

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://admin:admin123@localhost:5432/movies_db",
)

# Admin user ids (manage giveaways). Override via ADMIN_USER_IDS="1,5".
ADMIN_IDS = {int(x) for x in os.environ.get("ADMIN_USER_IDS", "1").split(",") if x.strip().isdigit()}
GIVEAWAY_MIN_WORDS = 200         # min words for a review to count toward tickets

# Free LLM for review relevance/quality check (giveaways).
# OpenAI-compatible chat-completions API — works with OpenRouter, Groq, Mistral,
# etc. Just set the three env vars below to switch providers (no code changes).
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
# Groq's OpenAI-compatible endpoint, reached THROUGH the Cloudflare Worker because
# api.groq.com is geo-blocked (403) from the server's region — same as TMDB. The
# worker proxies /groq/* → api.groq.com/* (forwarding auth + body).
LLM_API_URL = os.environ.get(
    "LLM_API_URL",
    "https://tmdb.andreykuzn19.workers.dev/groq/openai/v1/chat/completions",
)
# Comma-separated; tried in order until one responds. gpt-oss-120b (with
# reasoning_effort=low) reliably returns a clean YES/NO for the review prompt.
LLM_MODEL = os.environ.get("LLM_MODEL", "openai/gpt-oss-120b")

# GigaChat (Sber) — a Russian LLM, reachable from RU with no geo-block (Groq/
# OpenRouter get 403/429 from the server's region). When GIGACHAT_AUTH_KEY is set
# the review check uses GigaChat instead of the OpenAI-compatible endpoint above.
# The auth key is the base64 "Ключ авторизации" from developers.sber.ru.
GIGACHAT_AUTH_KEY = os.environ.get("GIGACHAT_AUTH_KEY", "")
GIGACHAT_SCOPE    = os.environ.get("GIGACHAT_SCOPE", "GIGACHAT_API_PERS")  # PERS = individuals
GIGACHAT_MODEL    = os.environ.get("GIGACHAT_MODEL", "GigaChat")
# Sber's endpoints use the Russian Trusted Root CA, which most containers don't
# trust — so requests to them run with verify=False. Silence the noisy warning.
requests.packages.urllib3.disable_warnings()
_gigachat_tok = {"token": None, "exp": 0.0}


def get_db():
    return psycopg2.connect(DATABASE_URL)


def log_error(context: str, message: str):
    """Best-effort: record an error for the admin panel. Never raises."""
    try:
        conn = get_db()
        conn.autocommit = True
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO app_errors (context, message) VALUES (%s, %s)",
            (str(context)[:200], str(message)[:2000]),
        )
        cur.close(); conn.close()
    except Exception as e:
        print(f"log_error failed: {e}")


def ensure_tables():
    conn = get_db()
    cur = conn.cursor()

    # --- users ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)

    # --- movies ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS movies (
            tmdb_id INT PRIMARY KEY,
            title TEXT NOT NULL,
            overview TEXT,
            poster_path TEXT,
            release_year INT,
            cached_at TIMESTAMP DEFAULT NOW()
        )
    """)

    # --- tv_shows ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS tv_shows (
            tmdb_id INT PRIMARY KEY,
            title TEXT NOT NULL,
            overview TEXT,
            poster_path TEXT,
            release_year INT,
            seasons INT,
            cached_at TIMESTAMP DEFAULT NOW()
        )
    """)

    # --- ratings (base) ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ratings (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            tmdb_id INT REFERENCES movies(tmdb_id) ON DELETE CASCADE,
            overall INT NOT NULL CHECK (overall BETWEEN 1 AND 10),
            story INT NOT NULL CHECK (story BETWEEN 1 AND 10),
            direction INT CHECK (direction BETWEEN 1 AND 10),
            acting INT NOT NULL CHECK (acting BETWEEN 1 AND 10),
            visuals INT NOT NULL CHECK (visuals BETWEEN 1 AND 10),
            music INT CHECK (music BETWEEN 1 AND 10),
            score FLOAT NOT NULL,
            review TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, tmdb_id)
        )
    """)

    # Safely add TV columns to ratings (idempotent)
    cur.execute("""
        DO $$ BEGIN
            BEGIN
                ALTER TABLE ratings ADD COLUMN tv_tmdb_id INT;
            EXCEPTION WHEN duplicate_column THEN NULL; END;
            BEGIN
                ALTER TABLE ratings ADD COLUMN characters INT;
            EXCEPTION WHEN duplicate_column THEN NULL; END;
            BEGIN
                ALTER TABLE ratings ADD COLUMN pacing INT;
            EXCEPTION WHEN duplicate_column THEN NULL; END;
            BEGIN
                ALTER TABLE ratings ADD COLUMN media_type VARCHAR(10) NOT NULL DEFAULT 'movie';
            EXCEPTION WHEN duplicate_column THEN NULL; END;
        END $$;
    """)

    # Make direction and music nullable (needed for TV ratings that don't use them)
    cur.execute("""
        DO $$ BEGIN
            ALTER TABLE ratings ALTER COLUMN direction DROP NOT NULL;
        EXCEPTION WHEN others THEN NULL; END $$;
    """)
    cur.execute("""
        DO $$ BEGIN
            ALTER TABLE ratings ALTER COLUMN music DROP NOT NULL;
        EXCEPTION WHEN others THEN NULL; END $$;
    """)

    # FK from ratings.tv_tmdb_id → tv_shows
    cur.execute("""
        DO $$ BEGIN
            ALTER TABLE ratings ADD CONSTRAINT ratings_tv_fk
                FOREIGN KEY (tv_tmdb_id) REFERENCES tv_shows(tmdb_id) ON DELETE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # Unique constraint: one user → one rating per TV show
    cur.execute("""
        DO $$ BEGIN
            ALTER TABLE ratings ADD CONSTRAINT ratings_user_tv_unique
                UNIQUE (user_id, tv_tmdb_id);
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    # --- reactions ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS reactions (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            rating_id INT REFERENCES ratings(id) ON DELETE CASCADE,
            emoji TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, rating_id)
        )
    """)

    # --- comments ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS comments (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            rating_id INT REFERENCES ratings(id) ON DELETE CASCADE,
            text TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)

    # --- pending_registrations ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pending_registrations (
            email TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            code TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL
        )
    """)

    # --- pending email changes (one per user; confirmed with a code) ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pending_email_changes (
            user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            new_email TEXT NOT NULL,
            code TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL
        )
    """)

    # --- pending password resets (one per email; confirmed with a code) ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pending_password_resets (
            email TEXT PRIMARY KEY,
            code TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL
        )
    """)

    # --- private notes (one per user per title; owner-only) ---
    cur.execute("""
        CREATE TABLE IF NOT EXISTS notes (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            media_type VARCHAR(10) NOT NULL,
            media_id INT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, media_type, media_id)
        )
    """)

    conn.commit()
    cur.close()
    conn.close()


def ensure_notes_table():
    """Create notes table independently (own autocommit conn) so it can't be
    blocked by an aborted ensure_tables() transaction."""
    conn = get_db()
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS notes (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            media_type VARCHAR(10) NOT NULL,
            media_id INT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, media_type, media_id)
        )
    """)
    cur.close()
    conn.close()


def ensure_season_columns():
    """Add season-scope columns + per-scope uniqueness for TV (autocommit)."""
    conn = get_db()
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("ALTER TABLE ratings ADD COLUMN IF NOT EXISTS season_from INT")
    cur.execute("ALTER TABLE ratings ADD COLUMN IF NOT EXISTS season_to INT")
    cur.execute("ALTER TABLE ratings ADD COLUMN IF NOT EXISTS review_genuine BOOLEAN")
    # profile customisation
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT")
    cur.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT")
    # one TV rating per (user, show, season-scope) — NULLs normalized to 0
    cur.execute("ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_user_tv_unique")
    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS ratings_user_tv_season_uniq
        ON ratings (user_id, tv_tmdb_id, COALESCE(season_from,0), COALESCE(season_to,0))
        WHERE tv_tmdb_id IS NOT NULL
    """)
    cur.close()
    conn.close()


def ensure_notifications_table():
    """Create notifications table (autocommit, idempotent)."""
    conn = get_db()
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            actor_id INT,
            actor_name TEXT,
            type VARCHAR(12) NOT NULL,
            rating_id INT,
            media_type VARCHAR(10),
            media_id INT,
            detail TEXT,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("ALTER TABLE notifications ALTER COLUMN type TYPE VARCHAR(20)")
    cur.close()
    conn.close()


def add_notification(cur, recipient_id, actor_id, ntype, rating_id, media_type, media_id, detail, allow_self=False):
    """Insert a notification. Skips self-actions unless allow_self (used for
    manual-review notifications, where admin and actor can be the same person)."""
    if not recipient_id or not media_id:
        return
    if recipient_id == actor_id and not allow_self:
        return
    cur.execute("SELECT username FROM users WHERE id=%s", (actor_id,))
    row = cur.fetchone()
    actor_name = row[0] if row else "Кто-то"
    cur.execute(
        """INSERT INTO notifications
           (user_id, actor_id, actor_name, type, rating_id, media_type, media_id, detail)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
        (recipient_id, actor_id, actor_name, ntype, rating_id, media_type, media_id, detail),
    )


def ensure_giveaways_tables():
    """Create giveaway tables (autocommit, idempotent)."""
    conn = get_db()
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS giveaways (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            deadline TIMESTAMP,
            status VARCHAR(10) NOT NULL DEFAULT 'open',
            winner_user_id INT,
            winner_name TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS giveaway_entries (
            id SERIAL PRIMARY KEY,
            giveaway_id INT REFERENCES giveaways(id) ON DELETE CASCADE,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            username TEXT,
            tickets INT NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(giveaway_id, user_id)
        )
    """)
    # winner's prize-claim details (one per giveaway)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS prize_claims (
            giveaway_id INT PRIMARY KEY REFERENCES giveaways(id) ON DELETE CASCADE,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            city TEXT,
            cinema TEXT,
            session TEXT,
            seat TEXT,
            comment TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)

    # app error log (for the admin panel)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS app_errors (
            id SERIAL PRIMARY KEY,
            context TEXT,
            message TEXT,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS winner_code TEXT")
    cur.execute("ALTER TABLE giveaways ADD COLUMN IF NOT EXISTS winner_email TEXT")
    # manual review of a ticket: NULL | 'pending' | 'approved' | 'rejected'
    cur.execute("ALTER TABLE ratings ADD COLUMN IF NOT EXISTS manual_status TEXT")
    cur.close()
    conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        ensure_tables()
    except Exception as e:
        print(f"WARNING: DB init skipped: {e}")
    try:
        ensure_giveaways_tables()
    except Exception as e:
        print(f"WARNING: giveaways table init failed: {e}")
    try:
        ensure_notes_table()
    except Exception as e:
        print(f"WARNING: notes table init failed: {e}")
    try:
        ensure_season_columns()
    except Exception as e:
        print(f"WARNING: season columns init failed: {e}")
    try:
        ensure_notifications_table()
    except Exception as e:
        print(f"WARNING: notifications table init failed: {e}")
    yield


CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
    "Access-Control-Max-Age": "3600",
}


class CORSHandler(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return Response(status_code=200, headers=CORS_HEADERS)
        response = await call_next(request)
        for k, v in CORS_HEADERS.items():
            response.headers[k] = v
        return response


app = FastAPI(title="WAW Cinema API", lifespan=lifespan)
app.add_middleware(CORSHandler)


@app.exception_handler(Exception)
async def _log_unhandled_exception(request: Request, exc: Exception):
    # HTTPExceptions are handled by FastAPI separately; this only fires for
    # real unhandled errors — record them for the admin "Проблемы" panel.
    log_error(f"{request.method} {request.url.path}", f"{type(exc).__name__}: {exc}")
    return JSONResponse(status_code=500, content={"detail": "Внутренняя ошибка сервера"})


def require_auth(authorization: str = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    try:
        return decode_token(authorization.split(" ", 1)[1])
    except Exception:
        raise HTTPException(status_code=401, detail="Недействительный токен")


def require_admin(authorization: str = Header(None)) -> dict:
    payload = require_auth(authorization)
    if payload["user_id"] not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Доступ только для администратора")
    return payload


def _words(t):
    return re.findall(r"[\w']+", (t or "").lower(), flags=re.UNICODE)


def is_quality_review(text):
    """Heuristic anti-spam check: enough words, varied vocabulary, real sentences."""
    words = _words(text)
    n = len(words)
    if n < GIVEAWAY_MIN_WORDS:
        return False
    if len(set(words)) / n < 0.4:                      # too repetitive
        return False
    sentences = [s for s in re.split(r"[.!?]+", text or "") if len(_words(s)) >= 3]
    return len(sentences) >= 2


def _gigachat_token():
    """Cached GigaChat OAuth access token (valid ~30 min). Refreshes when expired."""
    now = time.time()
    if _gigachat_tok["token"] and _gigachat_tok["exp"] - 60 > now:
        return _gigachat_tok["token"]
    import uuid
    r = requests.post(
        "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",
        headers={
            "Authorization": f"Basic {GIGACHAT_AUTH_KEY}",
            "RqUID": str(uuid.uuid4()),
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
        data={"scope": GIGACHAT_SCOPE},
        timeout=20,
        verify=False,
    )
    r.raise_for_status()
    d = r.json()
    _gigachat_tok["token"] = d["access_token"]
    # expires_at is a millisecond epoch; fall back to 25 min if absent
    _gigachat_tok["exp"] = (d.get("expires_at") or 0) / 1000 or (now + 1500)
    return _gigachat_tok["token"]


def _gigachat_classify(prompt, attempts=3):
    """GigaChat variant of _llm_classify — two-step (OAuth token, then chat).
    Returns (text_or_None, info)."""
    last = {}
    for attempt in range(attempts):
        try:
            token = _gigachat_token()
            r = requests.post(
                "https://gigachat.devices.sberbank.ru/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"model": GIGACHAT_MODEL, "max_tokens": 24, "temperature": 0.1,
                      "messages": [{"role": "user", "content": prompt}]},
                timeout=30,
                verify=False,
            )
            if r.status_code == 401:
                _gigachat_tok["token"] = None  # force refresh next attempt
            if r.status_code == 200:
                ch = r.json().get("choices", [])
                txt = (ch[0].get("message", {}).get("content") or "") if ch else ""
                if txt.strip():
                    return txt.strip(), {"provider": "gigachat", "http": 200}
            last = {"provider": "gigachat", "http": r.status_code, "body": r.text[:200]}
        except Exception as e:
            last = {"provider": "gigachat", "error": str(e)[:200]}
        if attempt < attempts - 1:
            time.sleep(2)
    return None, last


def _llm_classify(prompt, attempts=3):
    """Try the configured free models until one returns HTTP 200. Free models are
    often rate-limited (429), so on a pass where every model failed transiently
    (429/5xx/network) we wait briefly and retry. Returns (text_or_None, info).
    text is None only if no model produced an answer after all attempts."""
    models = [m.strip() for m in LLM_MODEL.split(",") if m.strip()]
    last = {}
    for attempt in range(attempts):
        transient = False
        for m in models:
            try:
                r = requests.post(
                    LLM_API_URL,
                    headers={"Authorization": f"Bearer {LLM_API_KEY}", "content-type": "application/json"},
                    json={"model": m, "max_tokens": 1000, "temperature": 0,
                          "reasoning_effort": "low",
                          "messages": [{"role": "user", "content": prompt}]},
                    timeout=20,
                )
                if r.status_code == 200:
                    ch = r.json().get("choices", [])
                    txt = (ch[0].get("message", {}).get("content") or "") if ch else ""
                    if txt.strip():
                        return txt.strip(), {"model": m, "http": 200}
                    transient = True  # empty body — treat as retryable
                if r.status_code in (429, 500, 502, 503, 504):
                    transient = True
                last = {"model": m, "http": r.status_code, "body": r.text[:200]}
            except Exception as e:
                transient = True
                last = {"model": m, "error": str(e)[:200]}
        if not transient:
            break  # only permanent failures (e.g. 404) — retrying won't help
        if attempt < attempts - 1:
            time.sleep(2.5)
    return None, last


def check_review_genuine(title, overview, text):
    """Ask a free OpenAI-compatible LLM whether the text is a genuine review OF
    THIS title. Returns True / False / None. None means 'could not determine'
    (no API key or every model failed) — callers must NOT treat None as genuine."""
    if not (GIGACHAT_AUTH_KEY or LLM_API_KEY):
        log_error("llm_review_check", "no LLM configured (neither GIGACHAT_AUTH_KEY nor LLM_API_KEY)")
        return None
    prompt = (
        "Ты — модератор рецензий на фильмы/сериалы.\n"
        f"Произведение: «{title}».\n"
        f"Официальное описание: {overview or '—'}\n\n"
        f"Текст пользователя:\n\"\"\"\n{text[:4000]}\n\"\"\"\n\n"
        "Засчитать этот текст как НАСТОЯЩУЮ рецензию ИМЕННО на это произведение?\n"
        "Отвечай YES только если текст реально оценивает само произведение "
        "(сюжет, игру актёров, режиссуру, атмосферу, личные впечатления от просмотра).\n"
        "Отвечай NO, если текст на постороннюю тему (программирование, базы данных, "
        "учёба, политика, реклама и т.п.), это спам, набор слов, бессмыслица, "
        "пересказ комментариев или вообще не про этот фильм/сериал.\n"
        "Ответь строго одним словом: YES или NO."
    )
    if GIGACHAT_AUTH_KEY:
        txt, info = _gigachat_classify(prompt)
    else:
        txt, info = _llm_classify(prompt)
    if txt is None:
        log_error("llm_review_check", f"no verdict — last: {info}")
        return None
    up = txt.upper()
    if "YES" in up and "NO" not in up:
        return True
    if "NO" in up and "YES" not in up:
        return False
    # Ambiguous / non-compliant output (e.g. a reasoning model) — undetermined.
    log_error("llm_review_check", f"ambiguous answer: {txt[:120]!r}")
    return None


def verify_rating(cur, rating_id, review_text):
    """Classify one rating's review relevance and cache it on the row.
    Writes review_genuine only when the LLM gave a definite YES/NO (True/False);
    leaves it untouched (NULL/previous) when undetermined. Returns the verdict
    (True/False/None). Does not commit — caller commits."""
    cur.execute("SELECT media_type, tmdb_id, tv_tmdb_id FROM ratings WHERE id=%s", (rating_id,))
    row = cur.fetchone()
    if not row:
        return None
    mtype, tmdb_id, tv_tmdb_id = row
    if mtype == "tv":
        cur.execute("SELECT title, overview FROM tv_shows WHERE tmdb_id=%s", (tv_tmdb_id,))
    else:
        cur.execute("SELECT title, overview FROM movies WHERE tmdb_id=%s", (tmdb_id,))
    r2 = cur.fetchone()
    title = r2[0] if r2 else ""
    overview = r2[1] if r2 else ""
    verdict = check_review_genuine(title, overview, review_text)
    if verdict is not None:
        cur.execute("UPDATE ratings SET review_genuine=%s WHERE id=%s", (verdict, rating_id))
    return verdict


def update_review_genuine(rating_id, review_text):
    """When a giveaway is open, classify a quality review's relevance and cache it.
    Runs in a background thread, so it retries patiently until the (free, often
    rate-limited) LLM returns a verdict — no admin button needed."""
    if not rating_id or not review_text or not is_quality_review(review_text):
        return
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM giveaways WHERE status='open' LIMIT 1")
        if not cur.fetchone():
            cur.close(); conn.close(); return
        for attempt in range(6):
            verdict = verify_rating(cur, rating_id, review_text)
            if verdict is not None:
                conn.commit()
                break
            conn.rollback()  # undetermined (all models busy) — wait and retry
            if attempt < 5:
                time.sleep(20)
        cur.close(); conn.close()
    except Exception as e:
        print(f"update_review_genuine error: {e}")


def verify_in_background(rating_id, review_text):
    """Fire-and-forget relevance check so saving a review returns immediately."""
    if not rating_id or not review_text:
        return
    threading.Thread(target=update_review_genuine, args=(rating_id, review_text), daemon=True).start()


def _too_similar(tokens_a, text_b):
    """Jaccard token-set similarity >= 0.8 → near-duplicate (copy/paste)."""
    tb = set(_words(text_b))
    if not tokens_a or not tb:
        return False
    inter = len(tokens_a & tb)
    union = len(tokens_a | tb)
    return union > 0 and inter / union >= 0.8


def is_near_duplicate(cur, rating_id, review_text, created_at):
    """True if this review is a near-duplicate of an earlier (or simultaneous)
    review by anyone — i.e. it's the copy, not the original. Same rule as the
    anti-plagiarism gate in qualifying_review, so the UI status matches ticketing."""
    toks = set(_words(review_text or ""))
    if not toks:
        return False
    cur.execute("SELECT id, review, created_at FROM ratings WHERE review IS NOT NULL")
    for oid, orv, oca in cur.fetchall():
        if oid == rating_id:
            continue
        if oca is not None and created_at is not None and oca > created_at:
            continue  # created after this one → not the earlier original
        if _too_similar(toks, orv):
            return True
    return False


def qualifying_review(cur, user_id, since, until=None):
    """Return (rating_id, review_text) of the user's first ORIGINAL genuine
    quality review (>=GIVEAWAY_MIN_WORDS words) written AFTER `since` and (if `until` is given)
    no later than `until` (the giveaway deadline), else None.
    Genuine = review_genuine IS TRUE (relevance verified). Near-duplicates of an
    earlier review (own or others') are excluded (anti-plagiarism) — unless an
    admin manually approved the review (manual_status='approved'), which overrides
    the anti-plagiarism gate (appeal for false positives)."""
    if until is not None:
        cur.execute(
            """SELECT id, review, created_at, manual_status FROM ratings
               WHERE user_id=%s AND review IS NOT NULL AND created_at > %s
                 AND created_at <= %s AND review_genuine IS TRUE""",
            (user_id, since, until),
        )
    else:
        cur.execute(
            """SELECT id, review, created_at, manual_status FROM ratings
               WHERE user_id=%s AND review IS NOT NULL AND created_at > %s
                 AND review_genuine IS TRUE""",
            (user_id, since),
        )
    candidates = [(rid, rv, ca, ms) for rid, rv, ca, ms in cur.fetchall() if is_quality_review(rv)]
    if not candidates:
        return None
    cur.execute("SELECT id, review, created_at FROM ratings WHERE review IS NOT NULL")
    corpus = cur.fetchall()
    for rid, rv, ca, ms in candidates:
        if ms == "approved":
            return (rid, rv)  # admin override — bypasses anti-plagiarism
        toks = set(_words(rv))
        original = True
        for oid, orv, oca in corpus:
            if oid == rid:
                continue
            # an earlier (or simultaneous) near-duplicate means this one is a copy
            if oca is not None and ca is not None and oca > ca:
                continue
            if _too_similar(toks, orv):
                original = False
                break
        if original:
            return (rid, rv)
    return None


def giveaway_tickets(cur, user_id, since, until=None):
    """1 ticket per user per giveaway — granted for the first original genuine
    quality review written after the giveaway started and before its deadline.
    Computed live, so deleting the review removes the ticket automatically."""
    return 1 if qualifying_review(cur, user_id, since, until) else 0


# =========================
# SCORING FORMULAS
# =========================

def calculate_score(overall, story, direction, acting, visuals, music) -> float:
    """
    Movie formula (weights sum to 1.0):
      Overall:   35%
      Script:    20%
      Direction: 15%
      Acting:    15%
      Visuals:   10%
      Sound:      5%
    """
    score = (
        overall   * 0.35 +
        story     * 0.20 +
        direction * 0.15 +
        acting    * 0.15 +
        visuals   * 0.10 +
        music     * 0.05
    )
    return round(max(1.0, min(10.0, score)), 2)


def calculate_score_tv(overall, story, characters, acting, visuals, pacing) -> float:
    """
    TV series formula (weights sum to 1.0):
      Overall:    30%  (slightly less — long-form needs more objective criteria)
      Script:     20%
      Characters: 20%  (key for series — you live with them for seasons)
      Performance:10%
      Visuals:    10%
      Pacing:     10%  (crucial for series — bad pacing wastes tens of hours)
    """
    score = (
        overall    * 0.30 +
        story      * 0.20 +
        characters * 0.20 +
        acting     * 0.10 +
        visuals    * 0.10 +
        pacing     * 0.10
    )
    return round(max(1.0, min(10.0, score)), 2)


# =========================
# TMDB HELPERS — MOVIES
# =========================

def fetch_tmdb_movie(tmdb_id: int) -> dict | None:
    res = requests.get(
        f"{TMDB_BASE}/movie/{tmdb_id}",
        params={"api_key": TMDB_API_KEY, "language": "ru-RU"},
        timeout=5,
    )
    if res.status_code != 200:
        return None
    d = res.json()
    year = None
    if d.get("release_date"):
        try:
            year = int(d["release_date"][:4])
        except ValueError:
            pass
    return {
        "tmdb_id": d["id"],
        "title": d.get("title", ""),
        "overview": d.get("overview", ""),
        "poster_path": d.get("poster_path"),
        "release_year": year,
    }


def cache_movie(conn, tmdb_id: int):
    cur = conn.cursor()
    cur.execute("SELECT tmdb_id FROM movies WHERE tmdb_id=%s", (tmdb_id,))
    if cur.fetchone():
        cur.close()
        return
    movie = fetch_tmdb_movie(tmdb_id)
    if not movie:
        cur.close()
        return
    cur.execute(
        """INSERT INTO movies (tmdb_id, title, overview, poster_path, release_year)
           VALUES (%s, %s, %s, %s, %s) ON CONFLICT (tmdb_id) DO NOTHING""",
        (movie["tmdb_id"], movie["title"], movie["overview"],
         movie["poster_path"], movie["release_year"]),
    )
    conn.commit()
    cur.close()


# =========================
# TMDB HELPERS — TV
# =========================

def fetch_tmdb_tv(tmdb_id: int) -> dict | None:
    res = requests.get(
        f"{TMDB_BASE}/tv/{tmdb_id}",
        params={"api_key": TMDB_API_KEY, "language": "ru-RU"},
        timeout=5,
    )
    if res.status_code != 200:
        return None
    d = res.json()
    year = None
    if d.get("first_air_date"):
        try:
            year = int(d["first_air_date"][:4])
        except ValueError:
            pass
    return {
        "tmdb_id": d["id"],
        "title": d.get("name", ""),
        "overview": d.get("overview", ""),
        "poster_path": d.get("poster_path"),
        "release_year": year,
        "seasons": d.get("number_of_seasons"),
    }


def cache_tv(conn, tmdb_id: int):
    cur = conn.cursor()
    cur.execute("SELECT tmdb_id FROM tv_shows WHERE tmdb_id=%s", (tmdb_id,))
    if cur.fetchone():
        cur.close()
        return
    show = fetch_tmdb_tv(tmdb_id)
    if not show:
        cur.close()
        return
    cur.execute(
        """INSERT INTO tv_shows (tmdb_id, title, overview, poster_path, release_year, seasons)
           VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT (tmdb_id) DO NOTHING""",
        (show["tmdb_id"], show["title"], show["overview"],
         show["poster_path"], show["release_year"], show["seasons"]),
    )
    conn.commit()
    cur.close()


# =========================
# AUTH
# =========================

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

def validate_email_domain(email: str):
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Некорректный формат email")
    domain = email.split("@")[1]
    try:
        dns.resolver.resolve(domain, "MX", lifetime=5)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Домен {domain} не принимает почту")


def send_verification_email(to_email: str, code: str):
    if not BREVO_API_KEY or not BREVO_SENDER:
        raise Exception("Brevo is not configured")
    res = requests.post(
        "https://api.brevo.com/v3/smtp/email",
        headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json"},
        json={
            "sender": {"name": "WAW Cinema", "email": BREVO_SENDER},
            "to": [{"email": to_email}],
            "subject": f"Код подтверждения WAW: {code}",
            "textContent": f"Привет!\n\nВаш код подтверждения для WAW: {code}\n\nКод действителен 15 минут.",
        },
        timeout=10,
    )
    if res.status_code >= 400:
        raise Exception(f"Brevo error {res.status_code}: {res.text}")


def send_password_reset_email(to_email: str, code: str):
    if not BREVO_API_KEY or not BREVO_SENDER:
        raise Exception("Brevo is not configured")
    res = requests.post(
        "https://api.brevo.com/v3/smtp/email",
        headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json"},
        json={
            "sender": {"name": "WAW Cinema", "email": BREVO_SENDER},
            "to": [{"email": to_email}],
            "subject": f"Сброс пароля WAW: {code}",
            "textContent": (
                f"Привет!\n\nВы запросили сброс пароля на WAW.\n"
                f"Код для сброса: {code}\n\nКод действителен 15 минут.\n"
                "Если вы не запрашивали сброс — просто игнорируйте это письмо, "
                "ваш пароль останется прежним."
            ),
        },
        timeout=10,
    )
    if res.status_code >= 400:
        raise Exception(f"Brevo error {res.status_code}: {res.text}")


def send_giveaway_announcement(giveaway_id, title, description):
    """Email every registered user about a new giveaway. Best-effort, runs in a
    background thread; no-op (logs) if Brevo isn't configured."""
    if not BREVO_API_KEY or not BREVO_SENDER:
        print(f"[DEV] New giveaway '{title}' — email blast skipped (Brevo not configured)")
        return
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT email FROM users WHERE email IS NOT NULL AND email <> ''")
        emails = [r[0] for r in cur.fetchall()]
        cur.close(); conn.close()
    except Exception as e:
        print(f"giveaway announcement db error: {e}")
        return
    link = "https://makuku.ddns.net/waw-movie/giveaways"
    subject = f"🎟 Новый розыгрыш на WAW: {title}"
    body = (
        f"Привет!\n\nНа WAW стартовал новый розыгрыш — «{title}».\n"
        + (f"\n{description}\n" if description else "")
        + f"\nНапишите рецензию (от {GIVEAWAY_MIN_WORDS} слов) на любой фильм или сериал, "
          "чтобы получить билет и участвовать.\n\n"
        + f"Подробнее: {link}\n"
    )
    sent = 0
    for em in emails:
        try:
            res = requests.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json"},
                json={
                    "sender": {"name": "WAW Cinema", "email": BREVO_SENDER},
                    "to": [{"email": em}],
                    "subject": subject,
                    "textContent": body,
                },
                timeout=10,
            )
            if res.status_code >= 400:
                print(f"giveaway email to {em} failed: {res.status_code} {res.text[:120]}")
            else:
                sent += 1
        except Exception as e:
            print(f"giveaway email to {em} error: {e}")
    print(f"giveaway announcement '{title}': sent {sent}/{len(emails)}")


@app.post("/auth/register")
def register(data: dict):
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not all([username, email, password]):
        raise HTTPException(status_code=400, detail="Все поля обязательны")
    if len(username) < 2 or len(username) > 30:
        raise HTTPException(status_code=400, detail="Имя пользователя: от 2 до 30 символов")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Пароль минимум 6 символов")
    validate_email_domain(email)

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE email=%s", (email,))
    if cur.fetchone():
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")
    cur.execute("SELECT id FROM users WHERE lower(username)=lower(%s)", (username,))
    if cur.fetchone():
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Имя пользователя уже занято")

    code = str(random.randint(100000, 999999))
    expires_at = datetime.utcnow() + timedelta(minutes=15)
    password_hash = hash_password(password)

    cur.execute("""
        INSERT INTO pending_registrations (email, username, password_hash, code, expires_at)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (email) DO UPDATE
          SET username=EXCLUDED.username, password_hash=EXCLUDED.password_hash,
              code=EXCLUDED.code, expires_at=EXCLUDED.expires_at
    """, (email, username, password_hash, code, expires_at))
    conn.commit()
    cur.close(); conn.close()

    try:
        send_verification_email(email, code)
    except Exception as e:
        print(f"Email send error: {e}")
        # roll back the pending row so the user can retry; never leak the code
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM pending_registrations WHERE email=%s", (email,))
        conn.commit(); cur.close(); conn.close()
        raise HTTPException(status_code=502, detail="Не удалось отправить письмо с кодом. Попробуйте позже.")

    return {"pending": True, "message": "Код отправлен на почту"}


@app.post("/auth/verify")
def verify(data: dict):
    email = (data.get("email") or "").strip().lower()
    code  = (data.get("code") or "").strip()

    if not email or not code:
        raise HTTPException(status_code=400, detail="Email и код обязательны")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT username, password_hash, code, expires_at
        FROM pending_registrations WHERE email=%s
    """, (email,))
    row = cur.fetchone()

    if not row:
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Заявка на регистрацию не найдена")

    username, password_hash, stored_code, expires_at = row

    if datetime.utcnow() > expires_at:
        cur.execute("DELETE FROM pending_registrations WHERE email=%s", (email,))
        conn.commit()
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Код устарел. Зарегистрируйтесь снова")

    if code != stored_code:
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Неверный код")

    cur.execute("SELECT id FROM users WHERE email=%s", (email,))
    if cur.fetchone():
        cur.execute("DELETE FROM pending_registrations WHERE email=%s", (email,))
        conn.commit()
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Email уже зарегистрирован")

    cur.execute(
        "INSERT INTO users (username, email, password) VALUES (%s,%s,%s)",
        (username, email, password_hash),
    )
    cur.execute("DELETE FROM pending_registrations WHERE email=%s", (email,))
    conn.commit()
    cur.close(); conn.close()
    return {"message": "Регистрация успешна"}


@app.post("/auth/login")
def login(data: dict):
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        raise HTTPException(status_code=400, detail="Введите email и пароль")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, username, password FROM users WHERE email=%s", (email,))
    user = cur.fetchone()
    cur.close(); conn.close()

    if not user or not verify_password(password, user[2]):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    token = create_token({"user_id": user[0], "username": user[1]})
    return {"token": token, "user_id": user[0], "username": user[1], "is_admin": user[0] in ADMIN_IDS}


@app.get("/auth/me")
def me(authorization: str = Header(None)):
    payload = require_auth(authorization)
    return {
        "user_id": payload["user_id"],
        "username": payload["username"],
        "is_admin": payload["user_id"] in ADMIN_IDS,
    }


@app.post("/auth/password/request")
def request_password_reset(data: dict):
    """Step 1 of 'forgot password': email a reset code to a registered address.
    Responds the same whether or not the email exists (anti-enumeration)."""
    email = (data.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Введите почту")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE lower(email)=lower(%s)", (email,))
    if not cur.fetchone():
        cur.close(); conn.close()
        return {"sent": True}  # don't reveal that the account doesn't exist

    code = str(random.randint(100000, 999999))
    expires_at = datetime.utcnow() + timedelta(minutes=15)
    cur.execute("""
        INSERT INTO pending_password_resets (email, code, expires_at)
        VALUES (%s, %s, %s)
        ON CONFLICT (email) DO UPDATE
          SET code=EXCLUDED.code, expires_at=EXCLUDED.expires_at
    """, (email, code, expires_at))
    conn.commit()

    try:
        send_password_reset_email(email, code)
    except Exception as e:
        log_error("password_reset_send", str(e))
        cur.execute("DELETE FROM pending_password_resets WHERE email=%s", (email,))
        conn.commit(); cur.close(); conn.close()
        raise HTTPException(status_code=502, detail="Не удалось отправить письмо с кодом. Попробуйте позже.")

    cur.close(); conn.close()
    return {"sent": True}


@app.post("/auth/password/confirm")
def confirm_password_reset(data: dict):
    """Step 2 of 'forgot password': verify the code and set a new password."""
    email = (data.get("email") or "").strip().lower()
    code = (data.get("code") or "").strip()
    new_password = data.get("password") or ""
    if not email or not code or not new_password:
        raise HTTPException(status_code=400, detail="Заполните все поля")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Пароль должен быть минимум 6 символов")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT code, expires_at FROM pending_password_resets WHERE email=%s", (email,))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Запрос на сброс не найден. Запросите код заново.")
    stored_code, expires_at = row
    if datetime.utcnow() > expires_at:
        cur.execute("DELETE FROM pending_password_resets WHERE email=%s", (email,))
        conn.commit(); cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Код устарел. Запросите сброс снова.")
    if code != stored_code:
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Неверный код")

    cur.execute("UPDATE users SET password=%s WHERE lower(email)=lower(%s)",
                (hash_password(new_password), email))
    cur.execute("DELETE FROM pending_password_resets WHERE email=%s", (email,))
    conn.commit(); cur.close(); conn.close()
    return {"message": "Пароль изменён"}


# =========================
# ADMIN PANEL (admin-only)
# =========================

ADMIN_TABLES = [
    "users", "movies", "tv_shows", "ratings", "reactions", "comments",
    "notes", "notifications", "giveaways", "giveaway_entries", "prize_claims",
    "pending_registrations", "pending_email_changes", "app_errors",
]
_MASK_COLS = {"password", "password_hash", "code", "avatar"}  # never expose raw


@app.get("/admin/overview")
def admin_overview(authorization: str = Header(None)):
    require_admin(authorization)
    conn = get_db()
    cur = conn.cursor()

    def one(q):
        cur.execute(q); return cur.fetchone()[0]

    counts = {
        "users": one("SELECT COUNT(*) FROM users"),
        "ratings": one("SELECT COUNT(*) FROM ratings"),
        "reviews": one("SELECT COUNT(*) FROM ratings WHERE review IS NOT NULL"),
        "movies": one("SELECT COUNT(*) FROM movies"),
        "tv_shows": one("SELECT COUNT(*) FROM tv_shows"),
        "giveaways_open": one("SELECT COUNT(*) FROM giveaways WHERE status='open'"),
        "giveaways_total": one("SELECT COUNT(*) FROM giveaways"),
        "entries": one("SELECT COUNT(*) FROM giveaway_entries"),
        "pending_registrations": one("SELECT COUNT(*) FROM pending_registrations"),
        "errors": one("SELECT COUNT(*) FROM app_errors"),
    }

    flags = []
    n = one("SELECT COUNT(*) FROM app_errors WHERE created_at > NOW() - INTERVAL '24 hours'")
    if n:
        flags.append({"level": "error", "text": f"Ошибок за последние 24 ч: {n}"})
    n = one("SELECT COUNT(*) FROM giveaways WHERE status='open' AND deadline IS NOT NULL AND deadline < NOW()")
    if n:
        flags.append({"level": "warn", "text": f"Розыгрышей с истёкшим дедлайном (ждут «Разыграть»): {n}"})
    n = one("SELECT COUNT(*) FROM ratings WHERE manual_status='pending'")
    if n:
        flags.append({"level": "warn", "text": f"Запросов на ручную проверку рецензий: {n}"})
    cur.close(); conn.close()
    return {"counts": counts, "flags": flags}


@app.get("/admin/tables")
def admin_tables(authorization: str = Header(None)):
    require_admin(authorization)
    conn = get_db()
    cur = conn.cursor()
    out = []
    for t in ADMIN_TABLES:
        try:
            cur.execute(f"SELECT COUNT(*) FROM {t}")
            out.append({"name": t, "rows": cur.fetchone()[0]})
        except Exception:
            conn.rollback()
    cur.close(); conn.close()
    return out


@app.get("/admin/table/{name}")
def admin_table(name: str, authorization: str = Header(None), limit: int = 50, offset: int = 0):
    require_admin(authorization)
    if name not in ADMIN_TABLES:
        raise HTTPException(status_code=404, detail="Таблица недоступна")
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name=%s", (name,))
    cols = [r[0] for r in cur.fetchall()]
    order = "created_at DESC" if "created_at" in cols else ("id DESC" if "id" in cols else (cols[0] if cols else "1"))
    cur.execute(f"SELECT * FROM {name} ORDER BY {order} LIMIT %s OFFSET %s", (limit, offset))
    rows = cur.fetchall()
    colnames = [d[0] for d in cur.description]

    def cell(cn, v):
        if cn in _MASK_COLS and v not in (None, ""):
            return "•••"
        s = v.isoformat() if hasattr(v, "isoformat") else v
        if isinstance(s, str) and len(s) > 300:
            s = s[:300] + "…"
        return s

    data = [{cn: cell(cn, v) for cn, v in zip(colnames, row)} for row in rows]
    cur.close(); conn.close()
    return {"columns": colnames, "rows": data, "limit": limit, "offset": offset}


@app.get("/admin/activity")
def admin_activity(authorization: str = Header(None)):
    require_admin(authorization)
    conn = get_db()
    cur = conn.cursor()
    events = []
    cur.execute("SELECT username, created_at FROM users ORDER BY created_at DESC LIMIT 15")
    for u, ts in cur.fetchall():
        events.append({"type": "user", "text": f"Регистрация: {u}", "at": ts.isoformat() if ts else None})
    cur.execute("""SELECT u.username, r.media_type, (r.review IS NOT NULL), r.created_at
                   FROM ratings r JOIN users u ON u.id = r.user_id
                   ORDER BY r.created_at DESC LIMIT 25""")
    for uname, mt, hasrev, ts in cur.fetchall():
        kind = "рецензия" if hasrev else "оценка"
        events.append({"type": "rating", "text": f"{uname}: {kind} ({'сериал' if mt == 'tv' else 'фильм'})", "at": ts.isoformat() if ts else None})
    cur.execute("""SELECT u.username, g.title, pc.created_at FROM prize_claims pc
                   JOIN users u ON u.id = pc.user_id JOIN giveaways g ON g.id = pc.giveaway_id
                   ORDER BY pc.created_at DESC LIMIT 10""")
    for uname, title, ts in cur.fetchall():
        events.append({"type": "claim", "text": f"{uname} отправил данные для приза «{title}»", "at": ts.isoformat() if ts else None})
    cur.close(); conn.close()
    events.sort(key=lambda e: e["at"] or "", reverse=True)
    return events[:60]


@app.get("/admin/errors")
def admin_errors(authorization: str = Header(None), limit: int = 100):
    require_admin(authorization)
    limit = max(1, min(limit, 500))
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, context, message, created_at FROM app_errors ORDER BY id DESC LIMIT %s", (limit,))
    rows = [{"id": r[0], "context": r[1], "message": r[2], "at": r[3].isoformat() if r[3] else None} for r in cur.fetchall()]
    cur.close(); conn.close()
    return rows


@app.post("/admin/errors/clear")
def admin_errors_clear(authorization: str = Header(None)):
    require_admin(authorization)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM app_errors")
    conn.commit(); cur.close(); conn.close()
    return {"ok": True}


@app.post("/admin/user-email")
def admin_set_user_email(data: dict, authorization: str = Header(None)):
    """Admin override: set a user's email directly (no verification code)."""
    require_admin(authorization)
    try:
        uid = int(data.get("user_id"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Некорректный id пользователя")
    email = (data.get("email") or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Введите корректную почту")
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT username FROM users WHERE id=%s", (uid,))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    cur.execute("SELECT id FROM users WHERE lower(email)=lower(%s) AND id<>%s", (email, uid))
    if cur.fetchone():
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Эта почта уже занята другим пользователем")
    cur.execute("UPDATE users SET email=%s WHERE id=%s", (email, uid))
    conn.commit(); cur.close(); conn.close()
    return {"ok": True, "user_id": uid, "username": row[0], "email": email}


# =========================
# MOVIES
# =========================

@app.get("/movies")
def get_movies():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT m.tmdb_id, m.title, m.overview, m.poster_path, m.release_year,
               COALESCE(AVG(r.score), 0) AS avg_score,
               COUNT(r.id) AS rating_count
        FROM movies m
        LEFT JOIN ratings r ON r.tmdb_id = m.tmdb_id
        GROUP BY m.tmdb_id, m.title, m.overview, m.poster_path, m.release_year
        HAVING COUNT(r.id) > 0
        ORDER BY rating_count DESC, avg_score DESC
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [
        {
            "id": r[0], "title": r[1], "overview": r[2],
            "poster": r[3], "year": r[4],
            "score": round(float(r[5]), 2), "count": r[6],
            "media_type": "movie",
        }
        for r in rows
    ]


@app.get("/movies/{tmdb_id}")
def get_movie(tmdb_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT m.tmdb_id, m.title, m.overview, m.poster_path, m.release_year,
               COALESCE(AVG(r.score), 0), COUNT(r.id)
        FROM movies m
        LEFT JOIN ratings r ON r.tmdb_id = m.tmdb_id
        WHERE m.tmdb_id = %s
        GROUP BY m.tmdb_id, m.title, m.overview, m.poster_path, m.release_year
    """, (tmdb_id,))
    row = cur.fetchone()
    cur.close(); conn.close()

    if row:
        return {
            "id": row[0], "title": row[1], "overview": row[2],
            "poster": row[3], "year": row[4],
            "score": round(float(row[5]), 2), "count": row[6],
            "media_type": "movie",
        }

    movie = fetch_tmdb_movie(tmdb_id)
    if not movie:
        raise HTTPException(status_code=404, detail="Фильм не найден")
    return {
        "id": movie["tmdb_id"], "title": movie["title"], "overview": movie["overview"],
        "poster": movie["poster_path"], "year": movie["release_year"],
        "score": 0.0, "count": 0, "media_type": "movie",
    }


@app.get("/movies/{tmdb_id}/score")
def get_movie_score(tmdb_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "SELECT COALESCE(AVG(score),0), COUNT(*) FROM ratings WHERE tmdb_id=%s",
        (tmdb_id,),
    )
    row = cur.fetchone()
    cur.close(); conn.close()
    return {"score": round(float(row[0]), 2), "count": row[1]}


# =========================
# TV SHOWS
# =========================

@app.get("/tv")
def get_tv_shows():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT t.tmdb_id, t.title, t.overview, t.poster_path, t.release_year, t.seasons,
               COALESCE(AVG(r.score), 0) AS avg_score,
               COUNT(r.id) AS rating_count
        FROM tv_shows t
        LEFT JOIN ratings r ON r.tv_tmdb_id = t.tmdb_id
        GROUP BY t.tmdb_id, t.title, t.overview, t.poster_path, t.release_year, t.seasons
        HAVING COUNT(r.id) > 0
        ORDER BY rating_count DESC, avg_score DESC
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [
        {
            "id": r[0], "title": r[1], "overview": r[2],
            "poster": r[3], "year": r[4], "seasons": r[5],
            "score": round(float(r[6]), 2), "count": r[7],
            "media_type": "tv",
        }
        for r in rows
    ]


@app.get("/tv/{tmdb_id}")
def get_tv_show(tmdb_id: int):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT t.tmdb_id, t.title, t.overview, t.poster_path, t.release_year, t.seasons,
               COALESCE(AVG(r.score), 0), COUNT(r.id)
        FROM tv_shows t
        LEFT JOIN ratings r ON r.tv_tmdb_id = t.tmdb_id
        WHERE t.tmdb_id = %s
        GROUP BY t.tmdb_id, t.title, t.overview, t.poster_path, t.release_year, t.seasons
    """, (tmdb_id,))
    row = cur.fetchone()
    cur.close(); conn.close()

    if row:
        return {
            "id": row[0], "title": row[1], "overview": row[2],
            "poster": row[3], "year": row[4], "seasons": row[5],
            "score": round(float(row[6]), 2), "count": row[7],
            "media_type": "tv",
        }

    # Not cached yet — fetch from TMDB and cache
    conn2 = get_db()
    cache_tv(conn2, tmdb_id)
    conn2.close()

    # Try to fetch from DB again after caching
    conn3 = get_db()
    cur3 = conn3.cursor()
    cur3.execute("""
        SELECT t.tmdb_id, t.title, t.overview, t.poster_path, t.release_year, t.seasons,
               COALESCE(AVG(r.score), 0), COUNT(r.id)
        FROM tv_shows t
        LEFT JOIN ratings r ON r.tv_tmdb_id = t.tmdb_id
        WHERE t.tmdb_id = %s
        GROUP BY t.tmdb_id, t.title, t.overview, t.poster_path, t.release_year, t.seasons
    """, (tmdb_id,))
    row2 = cur3.fetchone()
    cur3.close(); conn3.close()

    if row2:
        return {
            "id": row2[0], "title": row2[1], "overview": row2[2],
            "poster": row2[3], "year": row2[4], "seasons": row2[5],
            "score": round(float(row2[6]), 2), "count": row2[7],
            "media_type": "tv",
        }

    raise HTTPException(status_code=404, detail="Сериал не найден")


# =========================
# RATINGS
# =========================

def parse_seasons(data: dict):
    """Return (season_from, season_to). None,None means all seasons."""
    sf = data.get("season_from")
    st = data.get("season_to")
    if sf is None and st is None:
        return None, None
    if sf is None:
        sf = 1
    if st is None:
        st = sf
    if not (isinstance(sf, int) and isinstance(st, int) and 1 <= sf <= st):
        raise HTTPException(status_code=400, detail="Неверный диапазон сезонов")
    return sf, st


@app.post("/ratings")
def create_rating(data: dict, authorization: str = Header(None)):
    payload = require_auth(authorization)
    user_id = payload["user_id"]
    media_type = data.get("media_type", "movie")

    overall = data.get("overall")
    story   = data.get("story")
    acting  = data.get("acting")
    visuals = data.get("visuals")
    review  = (data.get("review") or "").strip()

    if media_type == "tv":
        tmdb_id    = data.get("tmdb_id")
        characters = data.get("characters")
        pacing     = data.get("pacing")
        season_from, season_to = parse_seasons(data)

        if None in [tmdb_id, overall, story, characters, acting, visuals, pacing]:
            raise HTTPException(status_code=400, detail="Не все критерии заполнены")
        values = [overall, story, characters, acting, visuals, pacing]
        if not all(isinstance(v, int) and 1 <= v <= 10 for v in values):
            raise HTTPException(status_code=400, detail="Оценки должны быть от 1 до 10")

        try:
            conn = get_db()
            cache_tv(conn, int(tmdb_id))
            cur = conn.cursor()
            cur.execute(
                """SELECT id FROM ratings WHERE user_id=%s AND tv_tmdb_id=%s
                   AND COALESCE(season_from,0)=COALESCE(%s,0)
                   AND COALESCE(season_to,0)=COALESCE(%s,0)""",
                (user_id, tmdb_id, season_from, season_to),
            )
            if cur.fetchone():
                cur.close(); conn.close()
                raise HTTPException(status_code=400, detail="Вы уже оценили этот охват сезонов")

            score = calculate_score_tv(overall, story, characters, acting, visuals, pacing)
            cur.execute(
                """INSERT INTO ratings
                   (user_id, tv_tmdb_id, overall, story, characters, acting, visuals, pacing,
                    score, review, media_type, season_from, season_to)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'tv',%s,%s) RETURNING id""",
                (user_id, tmdb_id, overall, story, characters, acting, visuals, pacing,
                 score, review or None, season_from, season_to),
            )
            new_id = cur.fetchone()[0]
            conn.commit()
            cur.close(); conn.close()
            verify_in_background(new_id, review or None)
            return {"score": score}
        except HTTPException:
            raise
        except Exception as e:
            print(f"ERROR creating TV rating: {e}")
            raise HTTPException(status_code=500, detail=f"Ошибка сохранения: {str(e)}")

    else:  # movie
        tmdb_id   = data.get("tmdb_id")
        direction = data.get("direction")
        music     = data.get("music")

        if None in [tmdb_id, overall, story, direction, acting, visuals, music]:
            raise HTTPException(status_code=400, detail="Не все критерии заполнены")
        values = [overall, story, direction, acting, visuals, music]
        if not all(isinstance(v, int) and 1 <= v <= 10 for v in values):
            raise HTTPException(status_code=400, detail="Оценки должны быть от 1 до 10")

        conn = get_db()
        cache_movie(conn, int(tmdb_id))
        cur = conn.cursor()
        cur.execute(
            "SELECT id FROM ratings WHERE user_id=%s AND tmdb_id=%s",
            (user_id, tmdb_id),
        )
        if cur.fetchone():
            cur.close(); conn.close()
            raise HTTPException(status_code=400, detail="Вы уже оценивали этот фильм")

        score = calculate_score(overall, story, direction, acting, visuals, music)
        cur.execute(
            """INSERT INTO ratings
               (user_id, tmdb_id, overall, story, direction, acting, visuals, music,
                score, review, media_type)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'movie') RETURNING id""",
            (user_id, tmdb_id, overall, story, direction, acting, visuals, music,
             score, review or None),
        )
        new_id = cur.fetchone()[0]
        conn.commit()
        cur.close(); conn.close()
        verify_in_background(new_id, review or None)
        return {"score": score}


@app.put("/ratings")
def update_rating(data: dict, authorization: str = Header(None)):
    payload = require_auth(authorization)
    user_id    = payload["user_id"]
    media_type = data.get("media_type", "movie")

    overall = data.get("overall")
    story   = data.get("story")
    acting  = data.get("acting")
    visuals = data.get("visuals")
    review  = (data.get("review") or "").strip()

    if media_type == "tv":
        rating_id  = data.get("rating_id")
        characters = data.get("characters")
        pacing     = data.get("pacing")
        season_from, season_to = parse_seasons(data)

        if rating_id is None:
            raise HTTPException(status_code=400, detail="Не указана оценка")
        if None in [overall, story, characters, acting, visuals, pacing]:
            raise HTTPException(status_code=400, detail="Не все критерии заполнены")
        values = [overall, story, characters, acting, visuals, pacing]
        if not all(isinstance(v, int) and 1 <= v <= 10 for v in values):
            raise HTTPException(status_code=400, detail="Оценки должны быть от 1 до 10")

        score = calculate_score_tv(overall, story, characters, acting, visuals, pacing)
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            UPDATE ratings
            SET overall=%s, story=%s, characters=%s, acting=%s, visuals=%s, pacing=%s,
                score=%s, review=%s, season_from=%s, season_to=%s
            WHERE id=%s AND user_id=%s
        """, (overall, story, characters, acting, visuals, pacing,
              score, review or None, season_from, season_to, rating_id, user_id))
        if cur.rowcount == 0:
            cur.close(); conn.close()
            raise HTTPException(status_code=404, detail="Оценка не найдена")
        conn.commit()
        cur.close(); conn.close()
        verify_in_background(rating_id, review or None)
        return {"score": score}

    else:  # movie
        tmdb_id   = data.get("tmdb_id")
        direction = data.get("direction")
        music     = data.get("music")

        if None in [tmdb_id, overall, story, direction, acting, visuals, music]:
            raise HTTPException(status_code=400, detail="Не все критерии заполнены")
        values = [overall, story, direction, acting, visuals, music]
        if not all(isinstance(v, int) and 1 <= v <= 10 for v in values):
            raise HTTPException(status_code=400, detail="Оценки должны быть от 1 до 10")

        score = calculate_score(overall, story, direction, acting, visuals, music)
        conn = get_db()
        cur = conn.cursor()
        cur.execute("""
            UPDATE ratings
            SET overall=%s, story=%s, direction=%s, acting=%s, visuals=%s, music=%s,
                score=%s, review=%s
            WHERE user_id=%s AND tmdb_id=%s
            RETURNING id
        """, (overall, story, direction, acting, visuals, music,
              score, review or None, user_id, tmdb_id))
        updated = cur.fetchone()
        if not updated:
            cur.close(); conn.close()
            raise HTTPException(status_code=404, detail="Оценка не найдена")
        conn.commit()
        cur.close(); conn.close()
        verify_in_background(updated[0], review or None)
        return {"score": score}


@app.delete("/ratings/{rating_id}")
def delete_rating(rating_id: int, authorization: str = Header(None)):
    payload = require_auth(authorization)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM ratings WHERE id=%s AND user_id=%s",
                (rating_id, payload["user_id"]))
    deleted = cur.rowcount
    conn.commit()
    cur.close(); conn.close()
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Оценка не найдена")
    return {"ok": True}


# =========================
# REVIEWS (MOVIES)
# =========================

def _enrich_reviews(cur, rows, viewer_id):
    """Attach reactions and comments to a list of rating rows."""
    rating_ids = [r[0] for r in rows]
    reactions_map = {}
    my_reactions = {}
    comments_map = {}

    if rating_ids:
        cur.execute("""
            SELECT rating_id, emoji, COUNT(*) FROM reactions
            WHERE rating_id = ANY(%s) GROUP BY rating_id, emoji
        """, (rating_ids,))
        for rating_id, emoji, count in cur.fetchall():
            reactions_map.setdefault(rating_id, {})[emoji] = count

        if viewer_id:
            cur.execute("""
                SELECT rating_id, emoji FROM reactions
                WHERE rating_id = ANY(%s) AND user_id = %s
            """, (rating_ids, viewer_id))
            for rating_id, emoji in cur.fetchall():
                my_reactions[rating_id] = emoji

        cur.execute("""
            SELECT c.rating_id, c.id, u.username, u.id, c.text, c.created_at
            FROM comments c JOIN users u ON u.id = c.user_id
            WHERE c.rating_id = ANY(%s) ORDER BY c.created_at ASC
        """, (rating_ids,))
        for rating_id, cid, uname, uid, text, cat in cur.fetchall():
            comments_map.setdefault(rating_id, []).append({
                "id": cid, "username": uname, "user_id": uid,
                "text": text,
                "created_at": cat.isoformat() if cat else None,
            })

    return reactions_map, my_reactions, comments_map


@app.get("/movies/{tmdb_id}/reviews")
def get_movie_reviews(tmdb_id: int, authorization: str = Header(None)):
    viewer_id = None
    try:
        if authorization:
            viewer_id = decode_token(authorization.replace("Bearer ", ""))["user_id"]
    except Exception:
        pass

    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT r.id, r.score, r.overall, r.story, r.direction, r.acting, r.visuals, r.music,
               r.review, u.username, u.id, r.created_at
        FROM ratings r
        JOIN users u ON u.id = r.user_id
        WHERE r.tmdb_id = %s
        ORDER BY r.created_at DESC
    """, (tmdb_id,))
    rows = cur.fetchall()
    reactions_map, my_reactions, comments_map = _enrich_reviews(cur, rows, viewer_id)
    cur.close(); conn.close()

    return [
        {
            "rating_id": r[0], "score": r[1], "overall": r[2], "story": r[3],
            "direction": r[4], "acting": r[5], "visuals": r[6], "music": r[7],
            "review": r[8], "username": r[9], "user_id": r[10],
            "created_at": r[11].isoformat() if r[11] else None,
            "reactions": reactions_map.get(r[0], {}),
            "my_reaction": my_reactions.get(r[0]),
            "comments": comments_map.get(r[0], []),
            "media_type": "movie",
        }
        for r in rows
    ]


@app.get("/movies/{tmdb_id}/my-rating")
def get_my_movie_rating(tmdb_id: int, authorization: str = Header(None)):
    payload = require_auth(authorization)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT score, overall, story, direction, acting, visuals, music, review, id
        FROM ratings WHERE user_id=%s AND tmdb_id=%s
    """, (payload["user_id"], tmdb_id))
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        return None
    return {
        "score": row[0], "overall": row[1], "story": row[2],
        "direction": row[3], "acting": row[4], "visuals": row[5],
        "music": row[6], "review": row[7], "rating_id": row[8], "media_type": "movie",
    }


@app.delete("/movies/{tmdb_id}/my-rating")
def delete_my_movie_rating(tmdb_id: int, authorization: str = Header(None)):
    payload = require_auth(authorization)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM ratings WHERE user_id=%s AND tmdb_id=%s",
                (payload["user_id"], tmdb_id))
    deleted = cur.rowcount
    conn.commit()
    cur.close(); conn.close()
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Оценка не найдена")
    return {"ok": True}


# =========================
# REVIEWS (TV)
# =========================

@app.get("/tv/{tmdb_id}/reviews")
def get_tv_reviews(tmdb_id: int, authorization: str = Header(None)):
    viewer_id = None
    try:
        if authorization:
            viewer_id = decode_token(authorization.replace("Bearer ", ""))["user_id"]
    except Exception:
        pass

    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT r.id, r.score, r.overall, r.story, r.characters, r.acting, r.visuals, r.pacing,
               r.review, u.username, u.id, r.created_at, r.season_from, r.season_to
        FROM ratings r
        JOIN users u ON u.id = r.user_id
        WHERE r.tv_tmdb_id = %s
        ORDER BY r.created_at DESC
    """, (tmdb_id,))
    rows = cur.fetchall()
    reactions_map, my_reactions, comments_map = _enrich_reviews(cur, rows, viewer_id)
    cur.close(); conn.close()

    return [
        {
            "rating_id": r[0], "score": r[1], "overall": r[2], "story": r[3],
            "characters": r[4], "acting": r[5], "visuals": r[6], "pacing": r[7],
            "review": r[8], "username": r[9], "user_id": r[10],
            "created_at": r[11].isoformat() if r[11] else None,
            "season_from": r[12], "season_to": r[13],
            "reactions": reactions_map.get(r[0], {}),
            "my_reaction": my_reactions.get(r[0]),
            "comments": comments_map.get(r[0], []),
            "media_type": "tv",
        }
        for r in rows
    ]


@app.get("/tv/{tmdb_id}/my-ratings")
def get_my_tv_ratings(tmdb_id: int, authorization: str = Header(None)):
    payload = require_auth(authorization)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, score, overall, story, characters, acting, visuals, pacing, review,
               season_from, season_to, created_at
        FROM ratings WHERE user_id=%s AND tv_tmdb_id=%s
        ORDER BY COALESCE(season_from, 0), created_at
    """, (payload["user_id"], tmdb_id))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [
        {
            "rating_id": r[0], "score": r[1], "overall": r[2], "story": r[3],
            "characters": r[4], "acting": r[5], "visuals": r[6], "pacing": r[7],
            "review": r[8], "season_from": r[9], "season_to": r[10],
            "created_at": r[11].isoformat() if r[11] else None,
            "media_type": "tv",
        }
        for r in rows
    ]


# =========================
# REACTIONS & COMMENTS
# =========================

ALLOWED_EMOJIS = {"👍", "❤️", "🔥", "😮", "🤔", "👎", "💩", "🤡"}

@app.post("/ratings/{rating_id}/react")
def react_to_review(rating_id: int, body: dict, authorization: str = Header(None)):
    payload = require_auth(authorization)
    emoji = body.get("emoji")
    if emoji not in ALLOWED_EMOJIS:
        raise HTTPException(status_code=400, detail="Invalid emoji")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT user_id, media_type, tmdb_id, tv_tmdb_id FROM ratings WHERE id = %s", (rating_id,))
    owner = cur.fetchone()
    if not owner:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Rating not found")

    cur.execute("SELECT emoji FROM reactions WHERE user_id=%s AND rating_id=%s",
                (payload["user_id"], rating_id))
    existing = cur.fetchone()

    if existing and existing[0] == emoji:
        cur.execute("DELETE FROM reactions WHERE user_id=%s AND rating_id=%s",
                    (payload["user_id"], rating_id))
        result = None
    elif existing:
        cur.execute("UPDATE reactions SET emoji=%s WHERE user_id=%s AND rating_id=%s",
                    (emoji, payload["user_id"], rating_id))
        result = emoji
    else:
        cur.execute("INSERT INTO reactions (user_id, rating_id, emoji) VALUES (%s,%s,%s)",
                    (payload["user_id"], rating_id, emoji))
        result = emoji

    if result is not None:
        owner_id, mtype, tmdb_id, tv_tmdb_id = owner
        media_id = tv_tmdb_id if mtype == "tv" else tmdb_id
        add_notification(cur, owner_id, payload["user_id"], "reaction", rating_id, mtype, media_id, emoji)

    conn.commit()
    cur.close(); conn.close()
    return {"my_reaction": result}


@app.post("/ratings/{rating_id}/comments")
def add_comment(rating_id: int, body: dict, authorization: str = Header(None)):
    payload = require_auth(authorization)
    text = (body.get("text") or "").strip()
    if not text or len(text) > 500:
        raise HTTPException(status_code=400, detail="Комментарий должен быть от 1 до 500 символов")
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT user_id, media_type, tmdb_id, tv_tmdb_id FROM ratings WHERE id = %s", (rating_id,))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Рецензия не найдена")
    cur.execute("""
        INSERT INTO comments (user_id, rating_id, text) VALUES (%s, %s, %s)
        RETURNING id, created_at
    """, (payload["user_id"], rating_id, text))
    cid, cat = cur.fetchone()
    owner_id, mtype, tmdb_id, tv_tmdb_id = row
    media_id = tv_tmdb_id if mtype == "tv" else tmdb_id
    snippet = text[:80] + ("…" if len(text) > 80 else "")
    add_notification(cur, owner_id, payload["user_id"], "comment", rating_id, mtype, media_id, snippet)
    conn.commit(); cur.close(); conn.close()
    return {"id": cid, "text": text, "created_at": cat.isoformat()}


# =========================
# NOTIFICATIONS
# =========================

@app.get("/notifications")
def list_notifications(authorization: str = Header(None)):
    payload = require_auth(authorization)
    uid = payload["user_id"]
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT n.id, n.actor_name, n.type, n.detail, n.media_type, n.media_id,
               n.is_read, n.created_at, COALESCE(m.title, t.title)
        FROM notifications n
        LEFT JOIN movies   m ON n.media_type = 'movie' AND m.tmdb_id = n.media_id
        LEFT JOIN tv_shows t ON n.media_type = 'tv'    AND t.tmdb_id = n.media_id
        WHERE n.user_id = %s
        ORDER BY n.created_at DESC
        LIMIT 50
    """, (uid,))
    rows = cur.fetchall()
    cur.execute("SELECT COUNT(*) FROM notifications WHERE user_id=%s AND is_read=FALSE", (uid,))
    unread = cur.fetchone()[0]
    cur.close(); conn.close()
    return {
        "unread": unread,
        "recipient_id": uid,
        "items": [
            {
                "id": r[0], "actor_name": r[1], "type": r[2], "detail": r[3],
                "media_type": r[4], "media_id": r[5], "is_read": r[6],
                "created_at": r[7].isoformat() if r[7] else None,
                "title": r[8],
            }
            for r in rows
        ],
    }


@app.post("/notifications/read")
def mark_notifications_read(authorization: str = Header(None)):
    payload = require_auth(authorization)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE notifications SET is_read=TRUE WHERE user_id=%s AND is_read=FALSE",
                (payload["user_id"],))
    conn.commit()
    cur.close(); conn.close()
    return {"ok": True}


# =========================
# GIVEAWAYS (cinema tickets)
# =========================

@app.get("/giveaways")
def list_giveaways(authorization: str = Header(None)):
    viewer_id = None
    is_admin = False
    if authorization and authorization.startswith("Bearer "):
        try:
            p = decode_token(authorization.split(" ", 1)[1])
            viewer_id = p["user_id"]
            is_admin = viewer_id in ADMIN_IDS
        except Exception:
            pass

    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, title, description, deadline, status, winner_name, created_at, winner_email, winner_user_id
        FROM giveaways ORDER BY (status='open') DESC, created_at DESC
    """)
    rows = cur.fetchall()

    entered = set()
    claimed_gids = set()
    if viewer_id:
        cur.execute("SELECT giveaway_id FROM giveaway_entries WHERE user_id=%s", (viewer_id,))
        entered = {r[0] for r in cur.fetchall()}
        cur.execute("SELECT giveaway_id FROM prize_claims WHERE user_id=%s", (viewer_id,))
        claimed_gids = {r[0] for r in cur.fetchall()}

    now = datetime.utcnow()
    items = []
    for r in rows:
        gid, created, deadline = r[0], r[6], r[3]
        # Effective participants: entrants who STILL hold a valid ticket (deleting
        # a review drops the ticket and removes the person from the count).
        cur.execute("SELECT user_id FROM giveaway_entries WHERE giveaway_id=%s", (gid,))
        entrant_ids = [x[0] for x in cur.fetchall()]
        eff_entries = sum(1 for eid in entrant_ids if giveaway_tickets(cur, eid, created, deadline) > 0)
        my_tickets = giveaway_tickets(cur, viewer_id, created, deadline) if viewer_id else None
        entered_effective = (gid in entered) and (my_tickets or 0) > 0

        status = r[4]
        winner_name = r[5]
        # Deadline passed with nobody holding a valid ticket — nothing to draw.
        # Auto-close with no winner instead of leaving it stuck "open" forever.
        if status == "open" and deadline and now > deadline and eff_entries == 0:
            cur.execute(
                "UPDATE giveaways SET status='closed', winner_user_id=NULL, winner_name=NULL, winner_email=NULL WHERE id=%s",
                (gid,),
            )
            status, winner_name = "closed", None

        is_winner = viewer_id is not None and viewer_id == r[8]
        items.append({
            "id": gid, "title": r[1], "description": r[2],
            "deadline": (r[3].isoformat() + "Z") if r[3] else None,
            "status": status, "winner_name": winner_name,
            "created_at": created.isoformat() if created else None,
            "entries": eff_entries,
            "entered": entered_effective,
            "my_tickets": my_tickets,
            "expired": bool(deadline and now > deadline),
            "winner_email": r[7] if is_admin else None,
            "is_winner": is_winner,
            "claimed": gid in claimed_gids,
        })
    conn.commit(); cur.close(); conn.close()

    return {
        "is_admin": is_admin,
        "min_words": GIVEAWAY_MIN_WORDS,
        "items": items,
    }


@app.post("/giveaways/{gid}/enter")
def enter_giveaway(gid: int, authorization: str = Header(None)):
    payload = require_auth(authorization)
    uid = payload["user_id"]
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT status, deadline, created_at FROM giveaways WHERE id=%s", (gid,))
    g = cur.fetchone()
    if not g:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Розыгрыш не найден")
    if g[0] != "open":
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Розыгрыш уже завершён")
    if g[1] and datetime.utcnow() > g[1]:
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Приём заявок закрыт")
    cur.execute("SELECT id FROM giveaway_entries WHERE giveaway_id=%s AND user_id=%s", (gid, uid))
    if cur.fetchone():
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Вы уже участвуете")
    tickets = giveaway_tickets(cur, uid, g[2], g[1])
    if tickets <= 0:
        cur.close(); conn.close()
        raise HTTPException(status_code=400,
            detail=f"Чтобы участвовать, после старта розыгрыша напишите рецензию от {GIVEAWAY_MIN_WORDS} слов")
    cur.execute("SELECT username FROM users WHERE id=%s", (uid,))
    uname = cur.fetchone()[0]
    cur.execute("INSERT INTO giveaway_entries (giveaway_id, user_id, username, tickets) VALUES (%s,%s,%s,%s)",
                (gid, uid, uname, tickets))
    conn.commit(); cur.close(); conn.close()
    return {"tickets": tickets}


@app.post("/admin/giveaways")
def create_giveaway(data: dict, authorization: str = Header(None)):
    require_admin(authorization)
    title = (data.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Укажите название фильма")
    desc = (data.get("description") or "").strip() or None
    dl = None
    if data.get("deadline"):
        try:
            dl = datetime.fromisoformat(str(data["deadline"]).replace("Z", ""))
        except ValueError:
            dl = None
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO giveaways (title, description, deadline) VALUES (%s,%s,%s) RETURNING id",
                (title, desc, dl))
    gid = cur.fetchone()[0]
    conn.commit(); cur.close(); conn.close()
    # notify all users by email (best-effort, non-blocking)
    threading.Thread(target=send_giveaway_announcement, args=(gid, title, desc), daemon=True).start()
    return {"id": gid}


@app.post("/admin/giveaways/{gid}/draw")
def draw_giveaway(gid: int, authorization: str = Header(None)):
    require_admin(authorization)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT status, created_at, title, deadline FROM giveaways WHERE id=%s", (gid,))
    g = cur.fetchone()
    if not g:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Розыгрыш не найден")
    if g[0] != "open":
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Розыгрыш уже проведён")
    since, title, deadline = g[1], g[2], g[3]
    cur.execute("SELECT user_id, username FROM giveaway_entries WHERE giveaway_id=%s", (gid,))
    entries = cur.fetchall()
    # live tickets per entrant (within [start, deadline]); only those with >0 can win
    pool, weights = [], []
    for uid, uname in entries:
        t = giveaway_tickets(cur, uid, since, deadline)
        if t > 0:
            pool.append((uid, uname, t))
            weights.append(t)
    if not pool:
        if deadline and datetime.utcnow() > deadline:
            # Deadline passed and nobody ever qualified — close with no winner
            # instead of leaving the giveaway stuck with no valid action.
            cur.execute(
                "UPDATE giveaways SET status='closed', winner_user_id=NULL, winner_name=NULL, winner_email=NULL WHERE id=%s",
                (gid,),
            )
            conn.commit(); cur.close(); conn.close()
            return {"winner_name": None, "winner_user_id": None, "winner_email": None}
        cur.close(); conn.close()
        raise HTTPException(status_code=400,
            detail="Пока ни у кого нет билетиков — никто не написал качественных рецензий после старта")
    winner = random.choices(pool, weights=weights, k=1)[0]
    cur.execute("SELECT email FROM users WHERE id=%s", (winner[0],))
    erow = cur.fetchone()
    winner_email = erow[0] if erow else None
    cur.execute("UPDATE giveaways SET status='closed', winner_user_id=%s, winner_name=%s, winner_email=%s WHERE id=%s",
                (winner[0], winner[1], winner_email, gid))
    # notify the winner — they claim the prize on the site, ticket arrives by email
    cur.execute(
        """INSERT INTO notifications (user_id, actor_id, actor_name, type, detail)
           VALUES (%s,%s,%s,'giveaway',%s)""",
        (winner[0], winner[0], title, None),
    )
    conn.commit(); cur.close(); conn.close()
    # email the winner (non-fatal)
    if winner_email and BREVO_API_KEY and BREVO_SENDER:
        try:
            requests.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json"},
                json={
                    "sender": {"name": "WAW Cinema", "email": BREVO_SENDER},
                    "to": [{"email": winner_email}],
                    "subject": f"🎉 Вы выиграли розыгрыш: {title}",
                    "textContent": (
                        f"Поздравляем! Вы победили в розыгрыше «{title}» на WAW.\n\n"
                        "Зайдите на сайт, нажмите «Получить приз» и заполните данные "
                        "(город, кинотеатр, сеанс, место) — билет придёт вам на почту.\n\n"
                        "https://makuku.ddns.net/waw-movie/giveaways\n"
                    ),
                },
                timeout=10,
            )
        except Exception as e:
            print(f"winner email error: {e}")
    return {"winner_name": winner[1], "winner_user_id": winner[0], "winner_email": winner_email}


@app.post("/giveaways/{gid}/claim")
def claim_prize(gid: int, data: dict, authorization: str = Header(None)):
    """The winner submits prize-delivery details; the admin is emailed."""
    payload = require_auth(authorization)
    uid = payload["user_id"]
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT winner_user_id, title FROM giveaways WHERE id=%s", (gid,))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Розыгрыш не найден")
    winner_user_id, title = row
    if winner_user_id != uid:
        cur.close(); conn.close()
        raise HTTPException(status_code=403, detail="Вы не победитель этого розыгрыша")

    city    = (data.get("city") or "").strip()
    cinema  = (data.get("cinema") or "").strip()
    session = (data.get("session") or "").strip()
    seat    = (data.get("seat") or "").strip()
    comment = (data.get("comment") or "").strip()
    if not city or not cinema or not session:
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Укажите город, кинотеатр и сеанс")

    cur.execute("""
        INSERT INTO prize_claims (giveaway_id, user_id, city, cinema, session, seat, comment)
        VALUES (%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (giveaway_id) DO UPDATE SET
          user_id=EXCLUDED.user_id, city=EXCLUDED.city, cinema=EXCLUDED.cinema,
          session=EXCLUDED.session, seat=EXCLUDED.seat, comment=EXCLUDED.comment, created_at=NOW()
    """, (gid, uid, city, cinema, session, seat, comment))
    cur.execute("SELECT username, email FROM users WHERE id=%s", (uid,))
    urow = cur.fetchone()
    uname = urow[0] if urow else "?"
    uemail = urow[1] if urow else "?"
    conn.commit(); cur.close(); conn.close()

    # email the admin with the claim details (non-fatal)
    if BREVO_API_KEY and BREVO_SENDER:
        body = (
            f"Победитель розыгрыша «{title}» отправил данные для приза:\n\n"
            f"Пользователь: {uname} ({uemail})\n"
            f"Город: {city}\n"
            f"Кинотеатр: {cinema}\n"
            f"Сеанс: {session or '—'}\n"
            f"Ряд / место: {seat or '—'}\n"
            f"Комментарий: {comment or '—'}\n"
        )
        try:
            requests.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json"},
                json={
                    "sender": {"name": "WAW Cinema", "email": BREVO_SENDER},
                    "to": [{"email": BREVO_SENDER}],
                    "subject": f"🎟 Данные для приза: {title}",
                    "textContent": body,
                },
                timeout=10,
            )
        except Exception as e:
            print(f"admin prize email error: {e}")

    return {"ok": True}


@app.delete("/admin/giveaways/{gid}")
def delete_giveaway(gid: int, authorization: str = Header(None)):
    require_admin(authorization)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM giveaways WHERE id=%s", (gid,))
    conn.commit(); cur.close(); conn.close()
    return {"ok": True}


@app.get("/admin/giveaways/{gid}/entries")
def list_giveaway_entries(gid: int, authorization: str = Header(None)):
    require_admin(authorization)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT created_at, deadline FROM giveaways WHERE id=%s", (gid,))
    g = cur.fetchone()
    if not g:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Розыгрыш не найден")
    since, deadline = g[0], g[1]
    cur.execute("""SELECT user_id, username, created_at FROM giveaway_entries
                   WHERE giveaway_id=%s ORDER BY created_at""", (gid,))
    rows = cur.fetchall()
    out = []
    for uid, uname, ca in rows:
        qr = qualifying_review(cur, uid, since, deadline)  # (rating_id, text) or None
        out.append({
            "username": uname,
            "tickets": 1 if qr else 0,
            "review": qr[1] if qr else None,
            "rating_id": qr[0] if qr else None,
            "created_at": ca.isoformat() if ca else None,
        })
    out.sort(key=lambda x: (-x["tickets"], x["username"] or ""))
    cur.close(); conn.close()
    return out


@app.post("/admin/giveaways/{gid}/recheck")
def recheck_giveaway(gid: int, authorization: str = Header(None)):
    """Force re-verify (via LLM) every quality review written after the giveaway
    started. Fixes stale review_genuine values — e.g. reviews counted while the
    LLM key was missing or all models were rate-limited."""
    require_admin(authorization)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT created_at, deadline FROM giveaways WHERE id=%s", (gid,))
    g = cur.fetchone()
    if not g:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Розыгрыш не найден")
    since, deadline = g[0], g[1]
    if deadline is not None:
        cur.execute(
            "SELECT id, review FROM ratings WHERE review IS NOT NULL AND created_at > %s AND created_at <= %s",
            (since, deadline),
        )
    else:
        cur.execute(
            "SELECT id, review FROM ratings WHERE review IS NOT NULL AND created_at > %s",
            (since,),
        )
    rows = [(rid, rv) for rid, rv in cur.fetchall() if is_quality_review(rv)]
    checked = genuine = offtopic = undetermined = 0
    for rid, rv in rows:
        v = verify_rating(cur, rid, rv)
        checked += 1
        if v is True:
            genuine += 1
        elif v is False:
            offtopic += 1
        else:
            undetermined += 1
    conn.commit(); cur.close(); conn.close()
    return {"checked": checked, "genuine": genuine, "offtopic": offtopic, "undetermined": undetermined}


@app.get("/giveaways/my-reviews")
def my_giveaway_reviews(authorization: str = Header(None)):
    """User-facing summary: the user's quality reviews written after the earliest
    OPEN giveaway started, with their relevance status (so they see what counted
    and what the AI rejected)."""
    payload = require_auth(authorization)
    uid = payload["user_id"]
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT MIN(created_at) FROM giveaways WHERE status='open'")
    row = cur.fetchone()
    since = row[0] if row else None
    if not since:
        cur.close(); conn.close()
        return {"open": False, "items": []}
    cur.execute("""
        SELECT r.id, r.review, r.review_genuine, r.manual_status, r.media_type,
               COALESCE(r.tmdb_id, r.tv_tmdb_id) AS media_id,
               COALESCE(m.title, t.title) AS title, r.created_at
        FROM ratings r
        LEFT JOIN movies   m ON r.media_type = 'movie' AND m.tmdb_id = r.tmdb_id
        LEFT JOIN tv_shows t ON r.media_type = 'tv'    AND t.tmdb_id = r.tv_tmdb_id
        WHERE r.user_id = %s AND r.review IS NOT NULL AND r.created_at > %s
        ORDER BY r.created_at DESC
    """, (uid, since))
    rows = cur.fetchall()
    items = []
    for rid, review, genuine, manual, mtype, media_id, title, created in rows:
        words = len(_words(review or ""))
        if manual == "pending":
            status = "manual_pending"
        elif manual == "rejected":
            status = "manual_rejected"
        elif manual == "approved":
            status = "passed"  # admin override wins
        elif not is_quality_review(review):
            # too short or too repetitive / no real sentences — tell the user why
            status = "too_short" if words < GIVEAWAY_MIN_WORDS else "low_quality"
        elif genuine is True:
            # passed the AI relevance check — but a plagiarised copy earns no ticket
            status = "duplicate" if is_near_duplicate(cur, rid, review, created) else "passed"
        elif genuine is False:
            status = "failed"
        else:
            status = "checking"
        items.append({
            "rating_id": rid, "title": title, "media_type": mtype, "media_id": media_id,
            "status": status, "words": words,
            "snippet": (review[:240] + ("…" if len(review) > 240 else "")),
        })
    cur.close(); conn.close()
    return {"open": True, "items": items, "min_words": GIVEAWAY_MIN_WORDS}


@app.post("/giveaways/request-manual/{rating_id}")
def request_manual_review(rating_id: int, authorization: str = Header(None)):
    """User asks the admin to manually review a rejected/unchecked review."""
    payload = require_auth(authorization)
    uid = payload["user_id"]
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""SELECT user_id, review, review_genuine, manual_status, media_type,
                          COALESCE(tmdb_id, tv_tmdb_id), created_at
                   FROM ratings WHERE id=%s""", (rating_id,))
    r = cur.fetchone()
    if not r or r[0] != uid:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Рецензия не найдена")
    owner, review, genuine, manual, mtype, media_id, created = r
    if not is_quality_review(review):
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail=f"Рецензия должна быть от {GIVEAWAY_MIN_WORDS} слов")
    # "already counted" only if it truly earns a ticket — a near-duplicate that
    # passed the AI check does NOT, so allow appealing it (possible false positive).
    if manual == "approved" or (genuine is True and not is_near_duplicate(cur, rating_id, review, created)):
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Эта рецензия уже засчитана")
    if manual == "pending":
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Запрос уже отправлен — ожидайте проверки")
    cur.execute("UPDATE ratings SET manual_status='pending' WHERE id=%s", (rating_id,))
    for admin_id in ADMIN_IDS:
        add_notification(cur, admin_id, uid, "manual_req", rating_id, mtype, media_id, None, allow_self=True)
    conn.commit(); cur.close(); conn.close()
    return {"ok": True}


@app.get("/admin/manual-reviews")
def admin_manual_reviews(authorization: str = Header(None)):
    """Pending manual-review requests for the admin to approve/reject."""
    require_admin(authorization)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT r.id, u.username, r.review, r.media_type,
               COALESCE(r.tmdb_id, r.tv_tmdb_id), COALESCE(m.title, t.title)
        FROM ratings r
        JOIN users u ON u.id = r.user_id
        LEFT JOIN movies   m ON r.media_type = 'movie' AND m.tmdb_id = r.tmdb_id
        LEFT JOIN tv_shows t ON r.media_type = 'tv'    AND t.tmdb_id = r.tv_tmdb_id
        WHERE r.manual_status = 'pending'
        ORDER BY r.id DESC
    """)
    out = [{"rating_id": x[0], "username": x[1], "review": x[2],
            "media_type": x[3], "media_id": x[4], "title": x[5]} for x in cur.fetchall()]
    cur.close(); conn.close()
    return out


@app.post("/admin/manual-reviews/{rating_id}")
def decide_manual_review(rating_id: int, data: dict, authorization: str = Header(None)):
    """Admin approves (grants ticket) or rejects a review — either a user-requested
    manual-review request, or a spot-check of a review the AI already passed
    (e.g. plagiarized from another site, which the AI has no way to detect).
    An optional `comment` explains a rejection to the user."""
    payload = require_admin(authorization)
    admin_id = payload["user_id"]
    decision = (data.get("decision") or "").lower()
    comment = (data.get("comment") or "").strip() or None
    if decision not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="decision must be approve|reject")
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""SELECT user_id, media_type, COALESCE(tmdb_id, tv_tmdb_id)
                   FROM ratings WHERE id=%s""", (rating_id,))
    r = cur.fetchone()
    if not r:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Рецензия не найдена")
    owner, mtype, media_id = r
    if decision == "approve":
        cur.execute("UPDATE ratings SET review_genuine=TRUE, manual_status='approved' WHERE id=%s", (rating_id,))
        add_notification(cur, owner, admin_id, "manual_ok", rating_id, mtype, media_id, comment, allow_self=True)
    else:
        cur.execute("UPDATE ratings SET review_genuine=FALSE, manual_status='rejected' WHERE id=%s", (rating_id,))
        add_notification(cur, owner, admin_id, "manual_no", rating_id, mtype, media_id, comment, allow_self=True)
    conn.commit(); cur.close(); conn.close()
    return {"ok": True, "decision": decision}


# =========================
# PRIVATE NOTES (owner-only)
# =========================

@app.get("/notes/{media_type}/{media_id}")
def get_note(media_type: str, media_id: int, authorization: str = Header(None)):
    payload = require_auth(authorization)
    user_id = payload["user_id"]
    if media_type not in ("movie", "tv"):
        raise HTTPException(status_code=400, detail="Неверный тип")
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "SELECT content, updated_at FROM notes WHERE user_id=%s AND media_type=%s AND media_id=%s",
        (user_id, media_type, media_id),
    )
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        return {"content": "", "updated_at": None}
    return {"content": row[0], "updated_at": row[1].isoformat() if row[1] else None}


@app.put("/notes/{media_type}/{media_id}")
def save_note(media_type: str, media_id: int, data: dict, authorization: str = Header(None)):
    payload = require_auth(authorization)
    user_id = payload["user_id"]
    if media_type not in ("movie", "tv"):
        raise HTTPException(status_code=400, detail="Неверный тип")
    content = (data.get("content") or "").strip()

    if not content:
        # empty note → remove it
        conn = get_db()
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM notes WHERE user_id=%s AND media_type=%s AND media_id=%s",
            (user_id, media_type, media_id),
        )
        conn.commit()
        cur.close(); conn.close()
        return {"content": "", "updated_at": None}

    # Cache the title in a SEPARATE connection (best-effort) so a failure here
    # can never abort the note-insert transaction.
    try:
        c2 = get_db()
        if media_type == "movie":
            cache_movie(c2, media_id)
        else:
            cache_tv(c2, media_id)
        c2.close()
    except Exception:
        pass

    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute(
            """INSERT INTO notes (user_id, media_type, media_id, content, updated_at)
               VALUES (%s,%s,%s,%s,NOW())
               ON CONFLICT (user_id, media_type, media_id)
               DO UPDATE SET content=EXCLUDED.content, updated_at=NOW()
               RETURNING updated_at""",
            (user_id, media_type, media_id, content),
        )
        updated_at = cur.fetchone()[0]
        conn.commit()
        return {"content": content, "updated_at": updated_at.isoformat() if updated_at else None}
    except Exception as e:
        conn.rollback()
        print(f"ERROR saving note: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка сохранения заметки: {str(e)}")
    finally:
        cur.close(); conn.close()


@app.get("/notes")
def list_notes(authorization: str = Header(None)):
    """All notes for the authenticated user, newest first, with title+poster."""
    payload = require_auth(authorization)
    user_id = payload["user_id"]
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT n.media_type, n.media_id, n.content, n.updated_at,
               COALESCE(m.title, t.title) AS title,
               COALESCE(m.poster_path, t.poster_path) AS poster
        FROM notes n
        LEFT JOIN movies   m ON n.media_type = 'movie' AND m.tmdb_id = n.media_id
        LEFT JOIN tv_shows t ON n.media_type = 'tv'    AND t.tmdb_id = n.media_id
        WHERE n.user_id = %s
        ORDER BY n.updated_at DESC
    """, (user_id,))
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [
        {
            "media_type": r[0],
            "media_id": r[1],
            "content": r[2],
            "updated_at": r[3].isoformat() if r[3] else None,
            "title": r[4],
            "poster": r[5],
        }
        for r in rows
    ]


# =========================
# RECENT ACTIVITY
# =========================

@app.get("/recent")
def get_recent():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT score, review, username, user_id, movie_id, movie_title, poster, created_at, media_type
        FROM (
            SELECT r.score, r.review, u.username, u.id AS user_id,
                   m.tmdb_id AS movie_id, m.title AS movie_title, m.poster_path AS poster,
                   r.created_at, 'movie' AS media_type
            FROM ratings r
            JOIN users u ON u.id = r.user_id
            JOIN movies m ON m.tmdb_id = r.tmdb_id
            WHERE r.tmdb_id IS NOT NULL
            UNION ALL
            SELECT r.score, r.review, u.username, u.id AS user_id,
                   t.tmdb_id AS movie_id, t.title AS movie_title, t.poster_path AS poster,
                   r.created_at, 'tv' AS media_type
            FROM ratings r
            JOIN users u ON u.id = r.user_id
            JOIN tv_shows t ON t.tmdb_id = r.tv_tmdb_id
            WHERE r.tv_tmdb_id IS NOT NULL
        ) combined
        ORDER BY created_at DESC
        LIMIT 20
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [
        {
            "score": r[0], "review": r[1],
            "username": r[2], "user_id": r[3],
            "movie_id": r[4], "movie_title": r[5], "poster": r[6],
            "created_at": r[7].isoformat() if r[7] else None,
            "media_type": r[8],
        }
        for r in rows
    ]


# =========================
# USER PROFILE
# =========================

@app.get("/profile/{user_id}")
def get_profile(user_id: int, authorization: str = Header(None)):
    # the email is returned only to the profile's owner
    viewer_id = None
    if authorization and authorization.startswith("Bearer "):
        try:
            viewer_id = decode_token(authorization.split(" ", 1)[1]).get("user_id")
        except Exception:
            viewer_id = None

    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT id, username, created_at, avatar, bio, email FROM users WHERE id=%s", (user_id,))
    user = cur.fetchone()
    if not user:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    cur.execute("""
        SELECT score, review, movie_id, title, poster, created_at,
               overall, story, direction, acting, visuals, music,
               characters, pacing, media_type, rating_id, season_from, season_to
        FROM (
            SELECT r.score, r.review, m.tmdb_id AS movie_id, m.title, m.poster_path AS poster,
                   r.created_at, r.overall, r.story, r.direction, r.acting, r.visuals, r.music,
                   r.characters, r.pacing, 'movie' AS media_type, r.id AS rating_id,
                   r.season_from, r.season_to
            FROM ratings r
            JOIN movies m ON m.tmdb_id = r.tmdb_id
            WHERE r.user_id = %s AND r.tmdb_id IS NOT NULL
            UNION ALL
            SELECT r.score, r.review, t.tmdb_id AS movie_id, t.title, t.poster_path AS poster,
                   r.created_at, r.overall, r.story, r.direction, r.acting, r.visuals, r.music,
                   r.characters, r.pacing, 'tv' AS media_type, r.id AS rating_id,
                   r.season_from, r.season_to
            FROM ratings r
            JOIN tv_shows t ON t.tmdb_id = r.tv_tmdb_id
            WHERE r.user_id = %s AND r.tv_tmdb_id IS NOT NULL
        ) combined
        ORDER BY created_at DESC
    """, (user_id, user_id))
    ratings = cur.fetchall()
    cur.close(); conn.close()

    return {
        "user_id": user[0],
        "username": user[1],
        "joined": user[2].isoformat() if user[2] else None,
        "avatar": user[3],
        "bio": user[4],
        "email": user[5] if viewer_id == user[0] else None,
        "ratings": [
            {
                "score": r[0], "review": r[1],
                "movie_id": r[2], "movie_title": r[3], "poster": r[4],
                "created_at": r[5].isoformat() if r[5] else None,
                "overall": r[6], "story": r[7], "direction": r[8],
                "acting": r[9], "visuals": r[10], "music": r[11],
                "characters": r[12], "pacing": r[13],
                "media_type": r[14], "rating_id": r[15],
                "season_from": r[16], "season_to": r[17],
            }
            for r in ratings
        ],
    }


@app.put("/profile")
def update_profile(data: dict, authorization: str = Header(None)):
    """Update the logged-in user's avatar + bio. Avatar is a small image data URI
    (resized client-side); pass null/"" to remove it."""
    payload = require_auth(authorization)
    uid = payload["user_id"]

    bio = (data.get("bio") or "").strip()
    if len(bio) > 1000:
        raise HTTPException(status_code=400, detail="«О себе»: не больше 1000 символов")
    bio = bio or None

    avatar = data.get("avatar")
    if avatar is not None:
        avatar = str(avatar).strip()
        if avatar == "":
            avatar = None
        elif not avatar.startswith("data:image/"):
            raise HTTPException(status_code=400, detail="Аватар должен быть изображением")
        elif len(avatar) > 500_000:
            raise HTTPException(status_code=400, detail="Изображение слишком большое — уменьшите")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("UPDATE users SET bio=%s, avatar=%s WHERE id=%s", (bio, avatar, uid))
    conn.commit(); cur.close(); conn.close()
    return {"ok": True}


@app.post("/profile/email/request")
def request_email_change(data: dict, authorization: str = Header(None)):
    """Logged-in user requests an email change: send a verification code to the
    NEW address. The change is applied only after /profile/email/confirm."""
    payload = require_auth(authorization)
    uid = payload["user_id"]
    new_email = (data.get("email") or "").strip().lower()
    if not new_email:
        raise HTTPException(status_code=400, detail="Введите новую почту")
    validate_email_domain(new_email)

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT email FROM users WHERE id=%s", (uid,))
    row = cur.fetchone()
    if row and (row[0] or "").lower() == new_email:
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Это уже ваша текущая почта")
    cur.execute("SELECT id FROM users WHERE lower(email)=lower(%s) AND id<>%s", (new_email, uid))
    if cur.fetchone():
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Эта почта уже занята")

    code = str(random.randint(100000, 999999))
    expires_at = datetime.utcnow() + timedelta(minutes=15)
    cur.execute("""
        INSERT INTO pending_email_changes (user_id, new_email, code, expires_at)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (user_id) DO UPDATE
          SET new_email=EXCLUDED.new_email, code=EXCLUDED.code, expires_at=EXCLUDED.expires_at
    """, (uid, new_email, code, expires_at))
    conn.commit()

    try:
        send_verification_email(new_email, code)
    except Exception as e:
        print(f"Email change send error: {e}")
        cur.execute("DELETE FROM pending_email_changes WHERE user_id=%s", (uid,))
        conn.commit(); cur.close(); conn.close()
        raise HTTPException(status_code=502, detail="Не удалось отправить письмо с кодом. Попробуйте позже.")

    cur.close(); conn.close()
    return {"pending": True, "message": "Код отправлен на новую почту"}


@app.post("/profile/email/confirm")
def confirm_email_change(data: dict, authorization: str = Header(None)):
    """Confirm the email change with the code sent to the new address."""
    payload = require_auth(authorization)
    uid = payload["user_id"]
    code = (data.get("code") or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Введите код")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT new_email, code, expires_at FROM pending_email_changes WHERE user_id=%s", (uid,))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Запрос на смену почты не найден")
    new_email, stored_code, expires_at = row
    if datetime.utcnow() > expires_at:
        cur.execute("DELETE FROM pending_email_changes WHERE user_id=%s", (uid,))
        conn.commit(); cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Код устарел. Запросите смену почты снова")
    if code != stored_code:
        cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Неверный код")
    # guard against the email being taken since the request
    cur.execute("SELECT id FROM users WHERE lower(email)=lower(%s) AND id<>%s", (new_email, uid))
    if cur.fetchone():
        cur.execute("DELETE FROM pending_email_changes WHERE user_id=%s", (uid,))
        conn.commit(); cur.close(); conn.close()
        raise HTTPException(status_code=400, detail="Эта почта уже занята")

    cur.execute("UPDATE users SET email=%s WHERE id=%s", (new_email, uid))
    cur.execute("DELETE FROM pending_email_changes WHERE user_id=%s", (uid,))
    conn.commit(); cur.close(); conn.close()
    return {"message": "Почта изменена", "email": new_email}


# =========================
# SIMILAR
# =========================

@app.get("/movies/{tmdb_id}/similar")
def get_similar_movies(tmdb_id: int):
    res = requests.get(
        f"{TMDB_BASE}/movie/{tmdb_id}/recommendations",
        params={"api_key": TMDB_API_KEY, "language": "ru-RU"},
        timeout=5,
    )
    if res.status_code != 200:
        return []
    return [
        {
            "id": m["id"],
            "title": m.get("title", ""),
            "poster": m.get("poster_path"),
            "year": m["release_date"][:4] if m.get("release_date") else None,
            "media_type": "movie",
        }
        for m in res.json().get("results", [])[:12]
    ]


@app.get("/tv/{tmdb_id}/similar")
def get_similar_tv(tmdb_id: int):
    res = requests.get(
        f"{TMDB_BASE}/tv/{tmdb_id}/recommendations",
        params={"api_key": TMDB_API_KEY, "language": "ru-RU"},
        timeout=5,
    )
    if res.status_code != 200:
        return []
    return [
        {
            "id": m["id"],
            "title": m.get("name", ""),
            "poster": m.get("poster_path"),
            "year": m["first_air_date"][:4] if m.get("first_air_date") else None,
            "media_type": "tv",
        }
        for m in res.json().get("results", [])[:12]
    ]


# =========================
# DETAILS (cast, images, country, genres)
# =========================

def _extract_cast(credits: dict, limit: int = None) -> list:
    cast = credits.get("cast", []) if credits else []
    if limit:
        cast = cast[:limit]
    return [
        {
            "id": c.get("id"),
            "name": c.get("name", ""),
            "character": c.get("character", ""),
            "photo": c.get("profile_path"),
        }
        for c in cast
    ]


@app.get("/movies/{tmdb_id}/details")
def get_movie_details(tmdb_id: int):
    res = requests.get(
        f"{TMDB_BASE}/movie/{tmdb_id}",
        params={
            "api_key": TMDB_API_KEY,
            "language": "ru-RU",
            "append_to_response": "credits,images",
            "include_image_language": "ru,en,null",
        },
        timeout=6,
    )
    if res.status_code != 200:
        return {}
    d = res.json()
    credits = d.get("credits", {})
    directors = [c["name"] for c in credits.get("crew", []) if c.get("job") == "Director"]
    backdrops = [b["file_path"] for b in d.get("images", {}).get("backdrops", [])[:10]]
    return {
        "genres": [g["name"] for g in d.get("genres", [])],
        "countries": [c["name"] for c in d.get("production_countries", [])],
        "runtime": d.get("runtime"),
        "tagline": d.get("tagline") or None,
        "original_title": d.get("original_title") or None,
        "directors": directors,
        "backdrops": backdrops,
        "cast": _extract_cast(credits),
    }


@app.get("/tv/{tmdb_id}/details")
def get_tv_details(tmdb_id: int):
    res = requests.get(
        f"{TMDB_BASE}/tv/{tmdb_id}",
        params={
            "api_key": TMDB_API_KEY,
            "language": "ru-RU",
            "append_to_response": "credits,images",
            "include_image_language": "ru,en,null",
        },
        timeout=6,
    )
    if res.status_code != 200:
        return {}
    d = res.json()
    credits = d.get("credits", {})
    creators = [c["name"] for c in d.get("created_by", [])]
    backdrops = [b["file_path"] for b in d.get("images", {}).get("backdrops", [])[:10]]
    countries = [c["name"] for c in d.get("production_countries", [])]
    if not countries:
        countries = d.get("origin_country", [])
    runtimes = d.get("episode_run_time", [])
    import datetime as _dt
    today = _dt.date.today().isoformat()
    aired = [s.get("air_date") for s in d.get("seasons", [])
             if (s.get("season_number") or 0) >= 1 and s.get("air_date") and s.get("air_date") <= today]
    latest_season_air = max(aired) if aired else d.get("last_air_date")
    return {
        "genres": [g["name"] for g in d.get("genres", [])],
        "countries": countries,
        "episode_runtime": runtimes[0] if runtimes else None,
        "seasons": d.get("number_of_seasons"),
        "episodes": d.get("number_of_episodes"),
        "latest_season_air": latest_season_air,
        "tagline": d.get("tagline") or None,
        "original_title": d.get("original_name") or None,
        "creators": creators,
        "backdrops": backdrops,
        "cast": _extract_cast(credits),
    }


@app.get("/person/{person_id}")
def get_person(person_id: int):
    """Actor/person page: details + acting filmography (from TMDB)."""
    try:
        res = requests.get(
            f"{TMDB_BASE}/person/{person_id}",
            params={
                "api_key": TMDB_API_KEY,
                "language": "ru-RU",
                "append_to_response": "combined_credits",
            },
            timeout=6,
        )
    except requests.RequestException:
        return {}
    if res.status_code != 200:
        return {}
    d = res.json()

    # Russian biography is often empty — fall back to English.
    bio = (d.get("biography") or "").strip()
    if not bio:
        try:
            en = requests.get(
                f"{TMDB_BASE}/person/{person_id}",
                params={"api_key": TMDB_API_KEY, "language": "en-US"},
                timeout=6,
            )
            if en.status_code == 200:
                bio = (en.json().get("biography") or "").strip()
        except requests.RequestException:
            pass

    seen = set()
    filmography = []
    for c in d.get("combined_credits", {}).get("cast", []):
        mt = c.get("media_type")
        cid = c.get("id")
        if mt not in ("movie", "tv") or cid is None or (mt, cid) in seen:
            continue
        seen.add((mt, cid))
        date = c.get("release_date") if mt == "movie" else c.get("first_air_date")
        filmography.append({
            "id": cid,
            "media_type": mt,
            "title": c.get("title") if mt == "movie" else c.get("name", ""),
            "character": c.get("character", ""),
            "poster": c.get("poster_path"),
            "year": date[:4] if date else None,
            "date": date or "",
            "popularity": c.get("popularity") or 0,
        })
    # newest first; undated projects go last
    filmography.sort(key=lambda x: x["date"], reverse=True)

    return {
        "id": d.get("id"),
        "name": d.get("name", ""),
        "photo": d.get("profile_path"),
        "biography": bio,
        "birthday": d.get("birthday"),
        "deathday": d.get("deathday"),
        "place_of_birth": d.get("place_of_birth"),
        "known_for": d.get("known_for_department"),
        "filmography": filmography,
    }


# =========================
# SEARCH
# =========================

def _tmdb_media_item(m):
    """Normalise a TMDB movie/tv result to our shape; None for other types."""
    mt = m.get("media_type")
    if mt == "movie":
        date = m.get("release_date")
        return {"id": m["id"], "title": m.get("title", ""), "original": m.get("original_title", ""),
                "overview": m.get("overview", ""), "poster": m.get("poster_path"),
                "year": date[:4] if date else None, "media_type": "movie",
                "popularity": m.get("popularity") or 0}
    if mt == "tv":
        date = m.get("first_air_date")
        return {"id": m["id"], "title": m.get("name", ""), "original": m.get("original_name", ""),
                "overview": m.get("overview", ""), "poster": m.get("poster_path"),
                "year": date[:4] if date else None, "media_type": "tv",
                "popularity": m.get("popularity") or 0}
    return None


def _attach_site_scores(items):
    """Add this site's average rating (site_score) + rating count (site_count) to
    each search/trending item that has been rated here — like Kinopoisk's badge."""
    if not items:
        return items
    movie_ids = [it["id"] for it in items if it["media_type"] == "movie"]
    tv_ids = [it["id"] for it in items if it["media_type"] == "tv"]
    scores = {}  # (media_type, tmdb_id) -> (avg, count)
    try:
        conn = get_db(); cur = conn.cursor()
        if movie_ids:
            cur.execute("""SELECT tmdb_id, AVG(score), COUNT(*) FROM ratings
                           WHERE tv_tmdb_id IS NULL AND tmdb_id = ANY(%s) GROUP BY tmdb_id""",
                        (movie_ids,))
            for tid, avg, cnt in cur.fetchall():
                scores[("movie", tid)] = (float(avg), cnt)
        if tv_ids:
            cur.execute("""SELECT tv_tmdb_id, AVG(score), COUNT(*) FROM ratings
                           WHERE tv_tmdb_id = ANY(%s) GROUP BY tv_tmdb_id""",
                        (tv_ids,))
            for tid, avg, cnt in cur.fetchall():
                scores[("tv", tid)] = (float(avg), cnt)
        cur.close(); conn.close()
    except Exception as e:
        log_error("attach_site_scores", str(e))
    for it in items:
        s = scores.get((it["media_type"], it["id"]))
        it["site_score"] = round(s[0], 2) if s else None
        it["site_count"] = s[1] if s else 0
    return items


@app.get("/trending")
def trending():
    """Popular movies + TV this week (most popular first) — the default search
    view shown before the user types anything."""
    try:
        res = requests.get(
            f"{TMDB_BASE}/trending/all/week",
            params={"api_key": TMDB_API_KEY, "language": "ru-RU"},
            timeout=8,
        )
    except requests.RequestException:
        return []
    if res.status_code != 200:
        return []
    out = []
    for m in res.json().get("results", []):
        item = _tmdb_media_item(m)
        if item:
            out.append(item)
    out.sort(key=lambda x: x["popularity"], reverse=True)
    return _attach_site_scores(out)


@app.get("/search/multi")
def search_multi(query: str):
    """Combined movie + TV search via TMDB /search/multi, ordered by relevance."""
    q = (query or "").strip()
    if not q:
        return []
    try:
        res = requests.get(
            f"{TMDB_BASE}/search/multi",
            params={"api_key": TMDB_API_KEY, "query": q, "language": "ru-RU"},
            timeout=8,
        )
    except requests.RequestException:
        # TMDB unreachable (e.g. blocked network) — degrade to empty instead of 500.
        return []
    if res.status_code != 200:
        return []
    out = [it for it in (_tmdb_media_item(m) for m in res.json().get("results", [])) if it]
    # most popular first (TMDB relevance often buries the obvious hits)
    out.sort(key=lambda x: x["popularity"], reverse=True)
    return _attach_site_scores(out)


@app.get("/search")
def search(query: str, media_type: str = "movie"):
    if media_type == "tv":
        res = requests.get(
            f"{TMDB_BASE}/search/tv",
            params={"api_key": TMDB_API_KEY, "query": query, "language": "ru-RU"},
            timeout=5,
        )
        if res.status_code != 200:
            raise HTTPException(status_code=500, detail="Ошибка TMDB")
        data = res.json()
        return [
            {
                "id": m["id"],
                "title": m.get("name", ""),
                "overview": m.get("overview", ""),
                "poster": m.get("poster_path"),
                "year": m["first_air_date"][:4] if m.get("first_air_date") else None,
                "media_type": "tv",
            }
            for m in data.get("results", [])
        ]
    else:
        res = requests.get(
            f"{TMDB_BASE}/search/movie",
            params={"api_key": TMDB_API_KEY, "query": query, "language": "ru-RU"},
            timeout=5,
        )
        if res.status_code != 200:
            raise HTTPException(status_code=500, detail="Ошибка TMDB")
        data = res.json()
        return [
            {
                "id": m["id"],
                "title": m.get("title", ""),
                "overview": m.get("overview", ""),
                "poster": m.get("poster_path"),
                "year": m["release_date"][:4] if m.get("release_date") else None,
                "media_type": "movie",
            }
            for m in data.get("results", [])
        ]
