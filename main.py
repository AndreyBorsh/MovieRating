import os
import re
import random
from datetime import datetime, timedelta
import dns.resolver
import requests
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.responses import Response
from starlette.middleware.base import BaseHTTPMiddleware
import psycopg2
from auth import hash_password, verify_password, create_token, decode_token

BREVO_API_KEY  = os.environ.get("BREVO_API_KEY", "")
BREVO_SENDER   = os.environ.get("BREVO_SENDER", "")  # verified sender email in Brevo

TMDB_API_KEY = "83d9d6d30f6249cd32695476886cf858"
TMDB_BASE = "https://api.themoviedb.org/3"

# Railway injects DATABASE_URL automatically when Postgres is attached
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://admin:admin123@localhost:5432/movies_db",
)


def get_db():
    return psycopg2.connect(DATABASE_URL)


def ensure_tables():
    """Create tables on first run — safe to call on every startup."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
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
    cur.execute("""
        CREATE TABLE IF NOT EXISTS ratings (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            tmdb_id INT REFERENCES movies(tmdb_id) ON DELETE CASCADE,
            overall INT NOT NULL CHECK (overall BETWEEN 1 AND 10),
            story INT NOT NULL CHECK (story BETWEEN 1 AND 10),
            direction INT NOT NULL CHECK (direction BETWEEN 1 AND 10),
            acting INT NOT NULL CHECK (acting BETWEEN 1 AND 10),
            visuals INT NOT NULL CHECK (visuals BETWEEN 1 AND 10),
            music INT NOT NULL CHECK (music BETWEEN 1 AND 10),
            score FLOAT NOT NULL,
            review TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, tmdb_id)
        )
    """)
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
    cur.execute("""
        CREATE TABLE IF NOT EXISTS comments (
            id SERIAL PRIMARY KEY,
            user_id INT REFERENCES users(id) ON DELETE CASCADE,
            rating_id INT REFERENCES ratings(id) ON DELETE CASCADE,
            text TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pending_registrations (
            email TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            code TEXT NOT NULL,
            expires_at TIMESTAMP NOT NULL
        )
    """)
    conn.commit()
    cur.close()
    conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        ensure_tables()
    except Exception as e:
        print(f"WARNING: DB init skipped: {e}")
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


def require_auth(authorization: str = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    try:
        return decode_token(authorization.split(" ", 1)[1])
    except Exception:
        raise HTTPException(status_code=401, detail="Недействительный токен")


# =========================
# SCORING FORMULA
# =========================
def calculate_score(overall, story, direction, acting, visuals, music) -> float:
    """
    Universal weighted score — works for any genre:
      Overall impression:  35%  (main criterion)
      Narrative/Script:    20%  (story, lyrics for musicals, character arcs for animation)
      Direction:           15%
      Acting/Performance:  15%  (voice acting / animation quality)
      Visual style:        10%
      Sound & Atmosphere:   5%  (music, sound design, mood)
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


# =========================
# TMDB HELPERS
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
# AUTH
# =========================

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

def validate_email_domain(email: str):
    """Check format and that the domain has MX records."""
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Некорректный формат email")
    domain = email.split("@")[1]
    try:
        dns.resolver.resolve(domain, "MX", lifetime=5)
    except Exception:
        raise HTTPException(status_code=400, detail=f"Домен {domain} не принимает почту")


def send_verification_email(to_email: str, code: str):
    """Send 6-digit code via Brevo HTTP API. Falls back to console log in dev."""
    if not BREVO_API_KEY or not BREVO_SENDER:
        print(f"[DEV] Verification code for {to_email}: {code}")
        return
    res = requests.post(
        "https://api.brevo.com/v3/smtp/email",
        headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json"},
        json={
            "sender": {"name": "WAW Cinema", "email": BREVO_SENDER},
            "to": [{"email": to_email}],
            "subject": f"Код подтверждения WAW: {code}",
            "textContent": f"Привет!\n\nВаш код подтверждения для WAW: {code}\n\nКод действителен 15 минут.\n\nЕсли вы не регистрировались — просто проигнорируйте это письмо.",
        },
        timeout=10,
    )
    if res.status_code >= 400:
        raise Exception(f"Brevo error {res.status_code}: {res.text}")


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

    if BREVO_API_KEY and BREVO_SENDER:
        try:
            send_verification_email(email, code)
            return {"pending": True, "message": "Код отправлен на почту"}
        except Exception as e:
            print(f"Email send error: {e}")

    return {"pending": True, "code": code}


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
    return {"token": token, "user_id": user[0], "username": user[1]}


@app.get("/auth/me")
def me(authorization: str = Header(None)):
    payload = require_auth(authorization)
    return {"user_id": payload["user_id"], "username": payload["username"]}


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
        ORDER BY rating_count DESC, avg_score DESC
    """)
    rows = cur.fetchall()
    cur.close(); conn.close()
    return [
        {
            "id": r[0], "title": r[1], "overview": r[2],
            "poster": r[3], "year": r[4],
            "score": round(float(r[5]), 2), "count": r[6],
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
        }

    # Not cached yet — fetch from TMDB
    movie = fetch_tmdb_movie(tmdb_id)
    if not movie:
        raise HTTPException(status_code=404, detail="Фильм не найден")
    return {**movie, "id": movie["tmdb_id"], "score": 0.0, "count": 0}


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
# RATINGS
# =========================

@app.post("/ratings")
def create_rating(data: dict, authorization: str = Header(None)):
    payload = require_auth(authorization)
    user_id = payload["user_id"]

    tmdb_id  = data.get("tmdb_id")
    overall  = data.get("overall")
    story    = data.get("story")
    direction = data.get("direction")
    acting   = data.get("acting")
    visuals  = data.get("visuals")
    music    = data.get("music")
    review   = (data.get("review") or "").strip()

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
           (user_id, tmdb_id, overall, story, direction, acting, visuals, music, score, review)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        (user_id, tmdb_id, overall, story, direction, acting, visuals, music, score, review or None),
    )
    conn.commit()
    cur.close(); conn.close()
    return {"score": score}


@app.get("/movies/{tmdb_id}/reviews")
def get_reviews(tmdb_id: int, authorization: str = Header(None)):
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
        }
        for r in rows
    ]


ALLOWED_EMOJIS = {"👍", "❤️", "🔥", "😮", "🤔", "👎", "💩", "🤡"}

@app.post("/ratings/{rating_id}/react")
def react_to_review(rating_id: int, body: dict, authorization: str = Header(None)):
    payload = require_auth(authorization)
    emoji = body.get("emoji")
    if emoji not in ALLOWED_EMOJIS:
        raise HTTPException(status_code=400, detail="Invalid emoji")

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM ratings WHERE id = %s", (rating_id,))
    if not cur.fetchone():
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
    cur.execute("SELECT user_id FROM ratings WHERE id = %s", (rating_id,))
    row = cur.fetchone()
    if not row:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Рецензия не найдена")
    cur.execute("""
        INSERT INTO comments (user_id, rating_id, text) VALUES (%s, %s, %s)
        RETURNING id, created_at
    """, (payload["user_id"], rating_id, text))
    cid, cat = cur.fetchone()
    conn.commit(); cur.close(); conn.close()
    return {"id": cid, "text": text, "created_at": cat.isoformat()}


@app.get("/movies/{tmdb_id}/my-rating")
def get_my_rating(tmdb_id: int, authorization: str = Header(None)):
    payload = require_auth(authorization)
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT score, overall, story, direction, acting, visuals, music, review
        FROM ratings WHERE user_id=%s AND tmdb_id=%s
    """, (payload["user_id"], tmdb_id))
    row = cur.fetchone()
    cur.close(); conn.close()
    if not row:
        return None
    return {
        "score": row[0], "overall": row[1], "story": row[2],
        "direction": row[3], "acting": row[4], "visuals": row[5],
        "music": row[6], "review": row[7],
    }


# =========================
# RECENT ACTIVITY
# =========================

@app.get("/recent")
def get_recent():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT r.score, r.review, u.username, u.id,
               m.tmdb_id, m.title, m.poster_path, r.created_at
        FROM ratings r
        JOIN users u ON u.id = r.user_id
        JOIN movies m ON m.tmdb_id = r.tmdb_id
        ORDER BY r.created_at DESC
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
        }
        for r in rows
    ]


# =========================
# USER PROFILE
# =========================

@app.get("/profile/{user_id}")
def get_profile(user_id: int):
    conn = get_db()
    cur = conn.cursor()

    cur.execute("SELECT id, username, created_at FROM users WHERE id=%s", (user_id,))
    user = cur.fetchone()
    if not user:
        cur.close(); conn.close()
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    cur.execute("""
        SELECT r.score, r.review, m.tmdb_id, m.title, m.poster_path, r.created_at,
               r.overall, r.story, r.direction, r.acting, r.visuals, r.music
        FROM ratings r
        JOIN movies m ON m.tmdb_id = r.tmdb_id
        WHERE r.user_id = %s
        ORDER BY r.created_at DESC
    """, (user_id,))
    ratings = cur.fetchall()
    cur.close(); conn.close()

    return {
        "user_id": user[0],
        "username": user[1],
        "joined": user[2].isoformat() if user[2] else None,
        "ratings": [
            {
                "score": r[0], "review": r[1],
                "movie_id": r[2], "movie_title": r[3], "poster": r[4],
                "created_at": r[5].isoformat() if r[5] else None,
                "overall": r[6], "story": r[7], "direction": r[8],
                "acting": r[9], "visuals": r[10], "music": r[11],
            }
            for r in ratings
        ],
    }


# =========================
# SEARCH
# =========================

@app.get("/search")
def search_movies(query: str):
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
        }
        for m in data.get("results", [])
    ]

