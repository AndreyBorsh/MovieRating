"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  getGiveaways, enterGiveaway, createGiveaway, drawGiveaway, deleteGiveaway, searchMulti,
  getGiveawayEntries, recheckGiveaway,
  getMyGiveawayReviews, requestManualReview, getManualReviews, decideManualReview,
} from "@/lib/api";

function fmtDate(s) {
  if (!s) return null;
  return new Date(s).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

const POSTER = (path) => (path ? `/api/tmdb-image/w92${path}` : null);

// Search-as-you-type film/TV picker for the admin create form.
function FilmPicker({ value, onPick }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const myId = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const data = await searchMulti(q);
        if (myId !== reqId.current) return;
        setResults(Array.isArray(data) ? data.slice(0, 8) : []);
      } catch {
        if (myId === reqId.current) setResults([]);
      } finally {
        if (myId === reqId.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const pick = (film) => {
    const label = film.year ? `${film.title} (${film.year})` : film.title;
    onPick(label);
    setQuery(""); setResults([]); setOpen(false);
  };

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "#141d2e", border: "1px solid #1e2d45" }}>
        <span className="text-sm text-slate-100 flex-1 min-w-0 truncate">🎬 {value}</span>
        <button onClick={() => onPick("")} className="text-xs text-slate-500 hover:text-red-400 transition shrink-0">сменить</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Найдите фильм или сериал…"
        className="w-full rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-amber-400/50"
        style={{ background: "#141d2e", border: "1px solid #1e2d45" }}
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border shadow-2xl"
          style={{ background: "#0c1220", borderColor: "#1e2d45" }}>
          {loading && results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-500">Поиск…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-500">Ничего не найдено</div>
          ) : (
            results.map((f) => (
              <button key={`${f.media_type}-${f.id}`} onClick={() => pick(f)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/5 transition border-b last:border-b-0"
                style={{ borderColor: "#1e2d45" }}>
                {POSTER(f.poster)
                  ? <img src={POSTER(f.poster)} alt="" className="w-8 h-12 object-cover rounded shrink-0" />
                  : <div className="w-8 h-12 rounded shrink-0 flex items-center justify-center text-base" style={{ background: "#141d2e" }}>{f.media_type === "tv" ? "📺" : "🎬"}</div>}
                <div className="min-w-0">
                  <div className="text-sm text-slate-100 truncate">{f.title}</div>
                  <div className="text-xs text-slate-500">{f.media_type === "tv" ? "Сериал" : "Фильм"}{f.year ? ` · ${f.year}` : ""}</div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Admin-only: who entered + the exact review that earned each ticket, with re-check.
function EntriesPanel({ token, giveawayId }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => {
    getGiveawayEntries(token, giveawayId).then((d) => setRows(Array.isArray(d) ? d : [])).catch(() => setRows([]));
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [giveawayId]);

  const recheck = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await recheckGiveaway(token, giveawayId);
      setMsg(`Проверено: ${r.checked} · по теме: ${r.genuine} · оффтоп: ${r.offtopic}${r.undetermined ? ` · не удалось: ${r.undetermined}` : ""}`);
      load();
    } catch (e) { setMsg(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-3 rounded-lg p-3" style={{ background: "#0c1220", border: "1px solid #1e2d45" }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-slate-400">Участники и зачтённые рецензии</span>
        <button onClick={recheck} disabled={busy}
          className="text-xs px-2 py-1 rounded border border-slate-700 text-slate-400 hover:text-amber-400 hover:border-amber-400/50 transition disabled:opacity-50">
          {busy ? "Проверяю…" : "🤖 Перепроверить рецензии"}
        </button>
      </div>
      {msg && <div className="text-[11px] text-slate-500 mb-2">{msg}</div>}
      {rows === null ? (
        <div className="text-xs text-slate-600">Загрузка…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-slate-600">Пока никто не участвует.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((e, i) => (
            <div key={i} className="rounded-md px-3 py-2" style={{ background: "#141d2e", border: "1px solid #1e2d45" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-slate-200 min-w-0 truncate">{e.username}</span>
                <span className={`text-xs font-semibold shrink-0 ${e.tickets > 0 ? "text-emerald-400" : "text-slate-500"}`}>
                  {e.tickets > 0 ? `${e.tickets} 🎟` : "0 🎟"}
                </span>
              </div>
              {e.review
                ? <p className="text-xs text-slate-400 mt-1 whitespace-pre-wrap break-words leading-snug">{e.review}</p>
                : <p className="text-xs text-slate-600 mt-1 italic">нет зачтённой рецензии (оффтоп / не подтверждена / удалена)</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_UI = {
  passed:          { label: "✓ зачтена",                cls: "text-emerald-400" },
  failed:          { label: "❌ не прошла ИИ-проверку",   cls: "text-red-400" },
  checking:        { label: "⏳ проверяется",            cls: "text-slate-400" },
  manual_pending:  { label: "🔎 на ручной проверке",     cls: "text-amber-400" },
  manual_rejected: { label: "❌ отклонено вручную",       cls: "text-red-400" },
};

// User-facing: status of the user's reviews for the current giveaway(s) + a
// "request manual review" button for ones the AI didn't pass.
function MyReviewsSummary({ token }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = () => {
    getMyGiveawayReviews(token).then(setData).catch(() => setData({ open: false, items: [] }));
  };
  useEffect(() => { if (token) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  if (!token || !data || !data.open || data.items.length === 0) return null;

  const ask = async (rid) => {
    setBusy(rid);
    try { await requestManualReview(token, rid); load(); }
    catch (e) { alert(e.message); }
    finally { setBusy(null); }
  };

  return (
    <div className="rounded-xl p-4 border space-y-2" style={{ background: "#0c1220", borderColor: "#1e2d45" }}>
      <div className="text-sm font-semibold text-slate-300">Мои рецензии для розыгрыша</div>
      {data.items.map((it) => {
        const ui = STATUS_UI[it.status] || STATUS_UI.checking;
        return (
          <div key={it.rating_id} className="rounded-lg px-3 py-2 flex items-start justify-between gap-3"
            style={{ background: "#141d2e", border: "1px solid #1e2d45" }}>
            <div className="min-w-0">
              <div className="text-sm text-slate-200 truncate">🎬 {it.title || "—"}</div>
              <div className={`text-xs mt-0.5 ${ui.cls}`}>{ui.label}</div>
            </div>
            {it.status === "failed" && (
              <button onClick={() => ask(it.rating_id)} disabled={busy === it.rating_id}
                className="shrink-0 text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:border-amber-400/50 hover:text-amber-400 transition disabled:opacity-50">
                {busy === it.rating_id ? "…" : "Запросить ручную проверку"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Admin-only: pending manual-review requests with approve/reject.
function ManualQueue({ token, onChange }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(null);

  const load = () => {
    getManualReviews(token).then((d) => setRows(Array.isArray(d) ? d : [])).catch(() => setRows([]));
  };
  useEffect(() => { if (token) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  const decide = async (rid, decision) => {
    setBusy(rid);
    try { await decideManualReview(token, rid, decision); load(); onChange && onChange(); }
    catch (e) { alert(e.message); }
    finally { setBusy(null); }
  };

  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl p-4 border space-y-3" style={{ background: "#0c1220", borderColor: "#3a4d2a" }}>
      <div className="text-sm font-semibold text-amber-400">🔎 Запросы на ручную проверку ({rows.length})</div>
      {rows.map((r) => (
        <div key={r.rating_id} className="rounded-lg px-3 py-2" style={{ background: "#141d2e", border: "1px solid #1e2d45" }}>
          <div className="text-sm text-slate-200 break-words">{r.username} · 🎬 {r.title || "—"}</div>
          <p className="text-xs text-slate-400 mt-1 whitespace-pre-wrap break-words leading-snug">{r.review}</p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => decide(r.rating_id, "approve")} disabled={busy === r.rating_id}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold text-slate-900 bg-emerald-400 hover:bg-emerald-300 transition disabled:opacity-50">
              ✓ Засчитать билетик
            </button>
            <button onClick={() => decide(r.rating_id, "reject")} disabled={busy === r.rating_id}
              className="text-xs px-3 py-1.5 rounded-lg text-slate-300 border border-slate-700 hover:border-red-400/50 hover:text-red-400 transition disabled:opacity-50">
              ✕ Отклонить
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function GiveawaysPage() {
  const { token, ready } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [openEntries, setOpenEntries] = useState(null);

  // admin create form
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [deadline, setDeadline] = useState("");

  const load = () => {
    getGiveaways(token)
      .then(setData)
      .catch(() => setData({ items: [] }))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!ready) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token]);

  const enter = async (id) => {
    setBusyId(id); setError("");
    try { await enterGiveaway(token, id); load(); }
    catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  };

  const create = async () => {
    setError("");
    try {
      // datetime-local is in the admin's local time; send UTC so it matches
      // the server's review timestamps.
      const deadlineUtc = deadline ? new Date(deadline).toISOString() : null;
      await createGiveaway(token, { title, description: desc, deadline: deadlineUtc });
      setTitle(""); setDesc(""); setDeadline(""); load();
    } catch (e) { setError(e.message); }
  };

  const draw = async (id) => {
    if (!confirm("Провести розыгрыш? Победитель выбирается случайно с учётом билетиков.")) return;
    setBusyId(id); setError("");
    try { const r = await drawGiveaway(token, id); alert(`Победитель: ${r.winner_name} 🎉${r.winner_email ? `\nПочта для связи: ${r.winner_email}` : ""}`); load(); }
    catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  };

  const remove = async (id) => {
    if (!confirm("Удалить розыгрыш?")) return;
    await deleteGiveaway(token, id);
    load();
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[40vh] text-slate-500 text-sm">Загрузка...</div>;
  }

  const items = data?.items || [];
  const isAdmin = data?.is_admin;
  const minWords = data?.min_words || 30;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 mb-1">🎟 Розыгрыш билета</h1>
        <p className="text-sm text-slate-500">
          Пиши развёрнутые рецензии после старта розыгрыша — и участвуй в розыгрыше билета в кино.
        </p>
      </div>

      <div className="rounded-xl px-4 py-3 border text-sm text-slate-400" style={{ background: "#141d2e", borderColor: "#1e2d45" }}>
        Как это работает: напиши <span className="text-slate-300">оригинальную рецензию (от {minWords} слов)</span> на любой
        фильм или сериал <span className="text-slate-300">после старта</span> розыгрыша — и получишь 1 билетик 🎟.
        Один билетик на участника, у всех равный шанс.
        «Вода», набор слов, оффтоп (рецензия не по теме) и копии чужих рецензий не засчитываются — это проверяет ИИ.
        Не согласен с проверкой — можно запросить ручную проверку ниже. Удалишь рецензию — билетик пропадёт.
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>
      )}

      {isAdmin && <ManualQueue token={token} onChange={load} />}

      <MyReviewsSummary token={token} />

      {isAdmin && (
        <div className="rounded-xl p-4 border space-y-3" style={{ background: "#0c1220", borderColor: "#1e2d45" }}>
          <div className="text-sm font-semibold text-amber-400">Админ · создать розыгрыш</div>
          <FilmPicker value={title} onPick={setTitle} />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Описание / кинотеатр / сеанс (необязательно)"
            className="w-full rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-amber-400/50"
            style={{ background: "#141d2e", border: "1px solid #1e2d45" }} />
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-500">Дедлайн участия:</label>
            <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)}
              className="rounded-lg px-2 py-1.5 text-sm text-slate-100 outline-none"
              style={{ background: "#141d2e", border: "1px solid #1e2d45" }} />
          </div>
          <button onClick={create} disabled={!title.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 transition">
            Создать розыгрыш
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl p-8 border text-center text-slate-500 text-sm" style={{ background: "#141d2e", borderColor: "#1e2d45" }}>
          Пока нет активных розыгрышей. Загляните позже!
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((g) => {
            const closed = g.status !== "open";
            return (
              <div key={g.id} className="rounded-xl p-5 border" style={{ background: "#141d2e", borderColor: closed ? "#1e2d45" : "#3a4d2a" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-semibold text-slate-100">🎬 {g.title}</h2>
                      {closed
                        ? <span className="text-xs text-slate-400 bg-slate-700/40 px-2 py-0.5 rounded">завершён</span>
                        : <span className="text-xs text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">идёт</span>}
                    </div>
                    {g.description && <p className="text-sm text-slate-400 mt-1">{g.description}</p>}
                    <div className="text-xs text-slate-600 mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      <span>Участников: {g.entries}</span>
                      {g.deadline && !closed && <span>До: {fmtDate(g.deadline)}</span>}
                    </div>
                  </div>
                  {isAdmin && (
                    <button onClick={() => remove(g.id)} title="Удалить розыгрыш"
                      className="shrink-0 px-2 py-1 rounded-lg text-sm text-slate-500 border border-slate-700 hover:border-red-400/50 hover:text-red-400 transition">
                      🗑
                    </button>
                  )}
                </div>

                {closed && g.winner_name && (
                  <div className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ background: "#0c1220", border: "1px solid #1e2d45" }}>
                    🏆 Победитель: <span className="text-amber-400 font-semibold">{g.winner_name}</span>
                    {isAdmin && g.winner_email && (
                      <span className="text-slate-500"> · почта: <span className="font-mono text-slate-300">{g.winner_email}</span></span>
                    )}
                  </div>
                )}

                {isAdmin && (
                  <div className="mt-3">
                    <button
                      onClick={() => setOpenEntries(openEntries === g.id ? null : g.id)}
                      className="text-xs text-slate-400 hover:text-amber-400 transition">
                      {openEntries === g.id ? "▾ Скрыть участников" : "▸ Участники и рецензии"}
                    </button>
                    {openEntries === g.id && <EntriesPanel token={token} giveawayId={g.id} />}
                  </div>
                )}

                {!closed && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {!token ? (
                      <Link href="/login" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 transition">
                        Войдите, чтобы участвовать
                      </Link>
                    ) : g.entered ? (
                      <span className="text-sm text-emerald-400">
                        ✓ Вы участвуете · <span className="font-semibold">{g.my_tickets} 🎟</span>
                      </span>
                    ) : g.expired ? (
                      <span className="text-sm text-slate-500">
                        Приём заявок завершён{(g.my_tickets || 0) > 0 ? " — ваш билетик сгорел (вы не участвовали)" : ""}
                      </span>
                    ) : (g.my_tickets || 0) > 0 ? (
                      <button onClick={() => enter(g.id)} disabled={busyId === g.id}
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 transition">
                        {busyId === g.id ? "..." : `Участвовать · ${g.my_tickets} 🎟`}
                      </button>
                    ) : (
                      <span className="text-sm text-slate-500">
                        Напишите рецензию от {minWords} слов <span className="text-slate-600">(после старта розыгрыша)</span>, чтобы получить билетик и участвовать
                      </span>
                    )}

                    {isAdmin && (
                      <button onClick={() => draw(g.id)} disabled={busyId === g.id}
                        className="px-3 py-2 rounded-lg text-sm font-medium text-slate-300 border border-slate-700 hover:border-amber-400/50 hover:text-amber-400 transition">
                        🎲 Разыграть
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
