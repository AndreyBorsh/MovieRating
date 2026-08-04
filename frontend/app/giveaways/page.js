"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  getGiveaways, enterGiveaway, createGiveaway, drawGiveaway, deleteGiveaway, searchMulti,
  getGiveawayEntries, recheckGiveaway, claimPrize,
  getMyGiveawayReviews, requestManualReview, getManualReviews, decideManualReview,
} from "@/lib/api";
import { img } from "@/lib/base";

function fmtDate(s) {
  if (!s) return null;
  return new Date(s).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

const POSTER = (path) => img("w92", path);

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
      <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(0,0,0,0.08)" }}>
        <span className="text-sm text-stone-900 flex-1 min-w-0 truncate">🎬 {value}</span>
        <button onClick={() => onPick("")} className="text-xs text-stone-500 hover:text-rose-500 transition shrink-0">сменить</button>
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
        className="w-full rounded-lg px-3 py-2 text-sm text-stone-900 outline-none focus:ring-1 focus:ring-amber-400/50"
        style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(0,0,0,0.08)" }}
      />
      {open && query.trim().length >= 2 && (
        <div className="absolute z-30 mt-1 w-full max-h-72 overflow-y-auto rounded-lg border shadow-2xl"
          style={{ background: "#efe9df", borderColor: "rgba(0,0,0,0.08)" }}>
          {loading && results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-stone-500">Поиск…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-stone-500">Ничего не найдено</div>
          ) : (
            results.map((f) => (
              <button key={`${f.media_type}-${f.id}`} onClick={() => pick(f)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-black/5 transition border-b last:border-b-0"
                style={{ borderColor: "rgba(0,0,0,0.08)" }}>
                {POSTER(f.poster)
                  ? <img src={POSTER(f.poster)} alt="" className="w-8 h-12 object-cover rounded shrink-0" />
                  : <div className="w-8 h-12 rounded shrink-0 flex items-center justify-center text-base" style={{ background: "rgba(255,255,255,0.72)" }}>{f.media_type === "tv" ? "📺" : "🎬"}</div>}
                <div className="min-w-0">
                  <div className="text-sm text-stone-900 truncate">{f.title}</div>
                  <div className="text-xs text-stone-500">{f.media_type === "tv" ? "Сериал" : "Фильм"}{f.year ? ` · ${f.year}` : ""}</div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// Admin-only: who entered + the exact review that earned each ticket, with re-check
// and a manual spot-check (AI can pass a review copy-pasted from another site —
// only a human reading it against the real film would catch that).
function EntriesPanel({ token, giveawayId }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [rejecting, setRejecting] = useState(null); // rating_id currently showing the comment form
  const [comment, setComment] = useState("");
  const [deciding, setDeciding] = useState(false);

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

  const confirmReject = async (ratingId) => {
    setDeciding(true);
    try {
      await decideManualReview(token, ratingId, "reject", comment);
      setRejecting(null); setComment(""); load();
    } catch (e) { alert(e.message); }
    finally { setDeciding(false); }
  };

  return (
    <div className="mt-3 rounded-lg p-3" style={{ background: "#efe9df", border: "1px solid rgba(0,0,0,0.08)" }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-stone-600">Участники и зачтённые рецензии</span>
        <button onClick={recheck} disabled={busy}
          className="text-xs px-2 py-1 rounded border border-stone-300 text-stone-600 hover:text-amber-600 hover:border-amber-400/50 transition disabled:opacity-50">
          {busy ? "Проверяю…" : "🤖 Перепроверить рецензии"}
        </button>
      </div>
      {msg && <div className="text-[11px] text-stone-500 mb-2">{msg}</div>}
      {rows === null ? (
        <div className="text-xs text-stone-400">Загрузка…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-stone-400">Пока никто не участвует.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((e, i) => (
            <div key={i} className="rounded-md px-3 py-2" style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(0,0,0,0.08)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-stone-800 min-w-0 truncate">{e.username}</span>
                <span className={`text-xs font-semibold shrink-0 ${e.tickets > 0 ? "text-emerald-600" : "text-stone-500"}`}>
                  {e.tickets > 0 ? `${e.tickets} 🎟` : "0 🎟"}
                </span>
              </div>
              {e.review
                ? <p className="text-xs text-stone-600 mt-1 whitespace-pre-wrap break-words leading-snug">{e.review}</p>
                : <p className="text-xs text-stone-400 mt-1 italic">нет зачтённой рецензии (оффтоп / не подтверждена / удалена)</p>}

              {e.review && e.rating_id && (
                rejecting === e.rating_id ? (
                  <div className="mt-2 space-y-1.5">
                    <textarea value={comment} onChange={(ev) => setComment(ev.target.value)}
                      placeholder="Почему рецензия не проходит (необязательно) — увидит пользователь"
                      rows={2}
                      className="w-full rounded-md px-2 py-1.5 text-xs text-stone-900 outline-none resize-none"
                      style={{ background: "#efe9df", border: "1px solid rgba(0,0,0,0.08)" }} />
                    <div className="flex gap-2">
                      <button onClick={() => confirmReject(e.rating_id)} disabled={deciding}
                        className="text-xs px-3 py-1.5 rounded-lg text-stone-900 bg-red-400 hover:bg-red-300 transition disabled:opacity-50">
                        {deciding ? "…" : "Подтвердить отклонение"}
                      </button>
                      <button onClick={() => { setRejecting(null); setComment(""); }}
                        className="text-xs px-3 py-1.5 rounded-lg text-stone-600 border border-stone-300 hover:text-stone-800 transition">
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setRejecting(e.rating_id); setComment(""); }}
                    className="mt-2 text-xs px-2 py-1 rounded border border-stone-300 text-stone-500 hover:text-rose-500 hover:border-red-400/50 transition">
                    🔎 Перепроверить · отклонить
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_UI = {
  passed:          { label: "✓ зачтена",                cls: "text-emerald-600" },
  duplicate:       { label: "♻️ дубликат — не засчитана", cls: "text-rose-500" },
  failed:          { label: "❌ не прошла ИИ-проверку",   cls: "text-rose-500" },
  too_short:       { label: "❌ слишком короткая",        cls: "text-rose-500" },
  low_quality:     { label: "❌ не прошла проверку качества (повторы / мало предложений)", cls: "text-rose-500" },
  checking:        { label: "⏳ проверяется",            cls: "text-stone-600" },
  manual_pending:  { label: "🔎 на ручной проверке",     cls: "text-amber-600" },
  manual_rejected: { label: "❌ отклонено вручную",       cls: "text-rose-500" },
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

  // Auto-refresh while any review is still being checked by the AI, so the
  // status flips to "зачтена"/"не прошла" without a manual page reload.
  useEffect(() => {
    if (!token || !data?.open) return;
    const pending = data.items.some((it) => it.status === "checking");
    if (!pending) return;
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [token, data]);

  if (!token || !data || !data.open || data.items.length === 0) return null;

  const ask = async (rid) => {
    setBusy(rid);
    try { await requestManualReview(token, rid); load(); }
    catch (e) { alert(e.message); }
    finally { setBusy(null); }
  };

  return (
    <div className="rounded-xl p-4 border space-y-2" style={{ background: "#efe9df", borderColor: "rgba(0,0,0,0.08)" }}>
      <div className="text-sm font-semibold text-stone-700">Мои рецензии для розыгрыша</div>
      {data.items.map((it) => {
        const ui = STATUS_UI[it.status] || STATUS_UI.checking;
        const label = it.status === "too_short"
          ? `❌ мало слов: ${it.words}/${data.min_words} — допишите рецензию`
          : ui.label;
        return (
          <div key={it.rating_id} className="rounded-lg px-3 py-2 flex items-start justify-between gap-3"
            style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(0,0,0,0.08)" }}>
            <div className="min-w-0">
              <div className="text-sm text-stone-800 truncate">🎬 {it.title || "—"}</div>
              <div className={`text-xs mt-0.5 ${ui.cls}`}>{label}</div>
            </div>
            {(it.status === "failed" || it.status === "duplicate") && (
              <button onClick={() => ask(it.rating_id)} disabled={busy === it.rating_id}
                className="shrink-0 text-xs px-2.5 py-1.5 rounded-lg border border-stone-300 text-stone-700 hover:border-amber-400/50 hover:text-amber-600 transition disabled:opacity-50">
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
    <div className="rounded-xl p-4 border space-y-3" style={{ background: "#efe9df", borderColor: "#3a4d2a" }}>
      <div className="text-sm font-semibold text-amber-600">🔎 Запросы на ручную проверку ({rows.length})</div>
      {rows.map((r) => (
        <div key={r.rating_id} className="rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(0,0,0,0.08)" }}>
          <div className="text-sm text-stone-800 break-words">{r.username} · 🎬 {r.title || "—"}</div>
          <p className="text-xs text-stone-600 mt-1 whitespace-pre-wrap break-words leading-snug">{r.review}</p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => decide(r.rating_id, "approve")} disabled={busy === r.rating_id}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold text-stone-900 bg-emerald-400 hover:bg-emerald-300 transition disabled:opacity-50">
              ✓ Засчитать билетик
            </button>
            <button onClick={() => decide(r.rating_id, "reject")} disabled={busy === r.rating_id}
              className="text-xs px-3 py-1.5 rounded-lg text-stone-700 border border-stone-300 hover:border-red-400/50 hover:text-rose-500 transition disabled:opacity-50">
              ✕ Отклонить
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ClaimPrizeModal({ token, giveawayId, onClose, onDone }) {
  const [form, setForm] = useState({ city: "", cinema: "", session: "", seat: "", comment: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.city.trim() || !form.cinema.trim() || !form.session.trim()) { setErr("Укажите город, кинотеатр и сеанс"); return; }
    setBusy(true); setErr("");
    try {
      await claimPrize(token, giveawayId, form);
      onDone();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const field = "w-full rounded-lg px-3 py-2 text-sm text-stone-900 outline-none focus:ring-1 focus:ring-amber-400/50";
  const fieldStyle = { background: "#fff", border: "1px solid rgba(0,0,0,0.12)" };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(30,22,12,0.55)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border overflow-y-auto max-h-[90vh] p-5 space-y-3"
        style={{ background: "#fbf9f4", borderColor: "rgba(0,0,0,0.06)", boxShadow: "0 24px 60px rgba(40,30,15,0.28)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold tracking-tight text-stone-900">🎁 Получить приз</h3>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-800 text-lg leading-none" aria-label="Закрыть">✕</button>
        </div>
        <p className="text-xs text-stone-500">
          Заполните данные — админ их получит и пришлёт билет вам на почту.
        </p>

        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">Город <span className="text-rose-400">*</span></label>
          <input value={form.city} onChange={set("city")} placeholder="Москва" className={field} style={fieldStyle} />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">Кинотеатр — название или ссылка <span className="text-rose-400">*</span></label>
          <input value={form.cinema} onChange={set("cinema")} placeholder="Кинотеатр «Октябрь» / ссылка на сайт" className={field} style={fieldStyle} />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">Сеанс (дата и время) <span className="text-rose-400">*</span></label>
          <input value={form.session} onChange={set("session")} placeholder="30 июля, 19:30" className={field} style={fieldStyle} />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">Ряд и место</label>
          <input value={form.seat} onChange={set("seat")} placeholder="ряд 5, место 12" className={field} style={fieldStyle} />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">Комментарий</label>
          <textarea value={form.comment} onChange={set("comment")} rows={2} placeholder="Необязательно" className={`${field} resize-none`} style={fieldStyle} />
        </div>

        {err && <p className="text-xs text-rose-500">{err}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg text-stone-600 hover:text-stone-800 transition">Отмена</button>
          <button onClick={submit} disabled={busy}
            className="text-sm px-4 py-2 rounded-lg font-semibold text-stone-900 bg-gradient-to-br from-amber-300 to-amber-500 hover:brightness-105 disabled:opacity-50 transition">
            {busy ? "Отправка…" : "Отправить"}
          </button>
        </div>
      </div>
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
  const [claimId, setClaimId] = useState(null);
  const [showFinished, setShowFinished] = useState(false);

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
    try {
      const r = await drawGiveaway(token, id);
      alert(r.winner_name
        ? `Победитель: ${r.winner_name} 🎉${r.winner_email ? `\nПочта для связи: ${r.winner_email}` : ""}`
        : "Приём заявок завершён, но никто так и не набрал билетик — розыгрыш закрыт без победителя.");
      load();
    }
    catch (e) { setError(e.message); }
    finally { setBusyId(null); }
  };

  const remove = async (id) => {
    if (!confirm("Удалить розыгрыш?")) return;
    await deleteGiveaway(token, id);
    load();
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[40vh] text-stone-500 text-sm">Загрузка...</div>;
  }

  const items = data?.items || [];
  const isAdmin = data?.is_admin;
  const minWords = data?.min_words || 30;
  const activeItems = items.filter((g) => g.status === "open");
  const finishedItems = items.filter((g) => g.status !== "open");

  const renderCard = (g) => {
    const closed = g.status !== "open";
    return (
      <div key={g.id} className="rounded-xl p-5 border" style={{ background: "rgba(255,255,255,0.72)", borderColor: (closed || g.expired) ? "rgba(0,0,0,0.08)" : "#3a4d2a" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold tracking-tight text-stone-900">🎬 {g.title}</h2>
              {closed
                ? <span className="text-xs text-stone-600 bg-stone-700/40 px-2 py-0.5 rounded">завершён</span>
                : g.expired
                  ? <span className="text-xs text-amber-700 bg-amber-400/15 px-2 py-0.5 rounded">приём завершён</span>
                  : <span className="text-xs text-emerald-600 bg-emerald-400/10 px-2 py-0.5 rounded">идёт</span>}
            </div>
            {g.description && <p className="text-sm text-stone-600 mt-1">{g.description}</p>}
            <div className="text-xs text-stone-400 mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <span>Участников: {g.entries}</span>
              {g.deadline && !closed && <span>{g.expired ? "Приём был до" : "До"}: {fmtDate(g.deadline)}</span>}
            </div>
          </div>
          {isAdmin && (
            <button onClick={() => remove(g.id)} title="Удалить розыгрыш"
              className="shrink-0 px-2 py-1 rounded-lg text-sm text-stone-500 border border-stone-300 hover:border-red-400/50 hover:text-rose-500 transition">
              🗑
            </button>
          )}
        </div>

        {closed && g.winner_name && (
          <div className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ background: "#efe9df", border: "1px solid rgba(0,0,0,0.08)" }}>
            🏆 Победитель: <span className="text-amber-600 font-semibold">{g.winner_name}</span>
            {isAdmin && g.winner_email && (
              <span className="text-stone-500"> · почта: <span className="font-mono text-stone-700">{g.winner_email}</span></span>
            )}
          </div>
        )}

        {g.is_winner && (
          <div className="mt-3">
            {g.claimed ? (
              <div className="rounded-lg px-3 py-2 text-sm text-emerald-700"
                   style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.25)" }}>
                🎟 Данные отправлены — ожидайте билет на почте.
              </div>
            ) : (
              <button
                onClick={() => setClaimId(g.id)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-stone-900 bg-gradient-to-br from-amber-300 to-amber-500 hover:brightness-105 transition"
              >
                🎁 Получить приз
              </button>
            )}
          </div>
        )}

        {isAdmin && (
          <div className="mt-3">
            <button
              onClick={() => setOpenEntries(openEntries === g.id ? null : g.id)}
              className="text-xs text-stone-600 hover:text-amber-600 transition">
              {openEntries === g.id ? "▾ Скрыть участников" : "▸ Участники и рецензии"}
            </button>
            {openEntries === g.id && <EntriesPanel token={token} giveawayId={g.id} />}
          </div>
        )}

        {!closed && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!token ? (
              <Link href="/login" className="px-4 py-2 rounded-lg text-sm font-semibold text-stone-900 bg-amber-400 hover:bg-amber-300 transition">
                Войдите, чтобы участвовать
              </Link>
            ) : g.entered ? (
              <span className="text-sm text-emerald-600">
                ✓ Вы участвуете · <span className="font-semibold">{g.my_tickets} 🎟</span>
              </span>
            ) : g.expired ? (
              <span className="text-sm text-stone-500">
                Приём заявок завершён{(g.my_tickets || 0) > 0 ? " — ваш билетик сгорел (вы не участвовали)" : ""}
              </span>
            ) : (g.my_tickets || 0) > 0 ? (
              <button onClick={() => enter(g.id)} disabled={busyId === g.id}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-stone-900 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 transition">
                {busyId === g.id ? "..." : `Участвовать · ${g.my_tickets} 🎟`}
              </button>
            ) : (
              <span className="text-sm text-stone-500">
                Напишите рецензию от {minWords} слов <span className="text-stone-400">(после старта розыгрыша)</span>, чтобы получить билетик и участвовать
              </span>
            )}

            {isAdmin && (
              <button onClick={() => draw(g.id)} disabled={busyId === g.id}
                className="px-3 py-2 rounded-lg text-sm font-medium text-stone-700 border border-stone-300 hover:border-amber-400/50 hover:text-amber-600 transition">
                🎲 Разыграть
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {claimId != null && (
        <ClaimPrizeModal
          token={token}
          giveawayId={claimId}
          onClose={() => setClaimId(null)}
          onDone={() => { setClaimId(null); load(); }}
        />
      )}

      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-stone-900 mb-1">🎟 Розыгрыш билета</h1>
        <p className="text-sm text-stone-500">
          Пиши развёрнутые рецензии после старта розыгрыша — и участвуй в розыгрыше билета в кино.
        </p>
      </div>

      <div className="rounded-xl px-4 py-3 border text-sm text-stone-600" style={{ background: "rgba(255,255,255,0.72)", borderColor: "rgba(0,0,0,0.08)" }}>
        Как это работает: напиши <span className="text-stone-700">оригинальную рецензию (от {minWords} слов)</span> на любой
        фильм или сериал <span className="text-stone-700">после старта</span> розыгрыша — и получишь 1 билетик 🎟.
        Один билетик на участника, у всех равный шанс.
        «Вода», набор слов, оффтоп (рецензия не по теме) и копии чужих рецензий не засчитываются — это проверяет ИИ.
        Не согласен с проверкой — можно запросить ручную проверку ниже. Удалишь рецензию — билетик пропадёт.
      </div>

      <p className="text-xs text-stone-400 px-1">
        📧 Выдача приза осуществляется через почту, привязанную к аккаунту.
      </p>

      {error && (
        <div className="text-sm text-rose-500 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>
      )}

      {isAdmin && <ManualQueue token={token} onChange={load} />}

      <MyReviewsSummary token={token} />

      {isAdmin && (
        <div className="rounded-xl p-4 border space-y-3" style={{ background: "#efe9df", borderColor: "rgba(0,0,0,0.08)" }}>
          <div className="text-sm font-semibold text-amber-600">Админ · создать розыгрыш</div>
          <FilmPicker value={title} onPick={setTitle} />
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Описание / кинотеатр / сеанс (необязательно)"
            className="w-full rounded-lg px-3 py-2 text-sm text-stone-900 outline-none focus:ring-1 focus:ring-amber-400/50"
            style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(0,0,0,0.08)" }} />
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-stone-500">Дедлайн участия:</label>
            <input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)}
              className="rounded-lg px-2 py-1.5 text-sm text-stone-900 outline-none"
              style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(0,0,0,0.08)" }} />
          </div>
          <button onClick={create} disabled={!title.trim()}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-stone-900 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 transition">
            Создать розыгрыш
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl p-8 border text-center text-stone-500 text-sm" style={{ background: "rgba(255,255,255,0.72)", borderColor: "rgba(0,0,0,0.08)" }}>
          Пока нет активных розыгрышей. Загляните позже!
        </div>
      ) : (
        <div className="space-y-4">
          {activeItems.length === 0 ? (
            <div className="rounded-xl p-8 border text-center text-stone-500 text-sm" style={{ background: "rgba(255,255,255,0.72)", borderColor: "rgba(0,0,0,0.08)" }}>
              Сейчас нет активных розыгрышей. Загляните позже!
            </div>
          ) : (
            activeItems.map(renderCard)
          )}

          {finishedItems.length > 0 && (
            <div className="space-y-4 pt-2">
              <button
                onClick={() => setShowFinished((v) => !v)}
                className="w-full flex items-center justify-between gap-3 rounded-xl px-4 py-3 border text-sm font-semibold text-stone-700 hover:text-amber-600 transition"
                style={{ background: "#efe9df", borderColor: "rgba(0,0,0,0.08)" }}
              >
                <span>🏁 Завершённые розыгрыши <span className="text-stone-400 font-normal">({finishedItems.length})</span></span>
                <span className="text-stone-400">{showFinished ? "▾ скрыть" : "▸ показать"}</span>
              </button>
              {showFinished && <div className="space-y-4">{finishedItems.map(renderCard)}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
