"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  getGiveaways, enterGiveaway, createGiveaway, drawGiveaway, deleteGiveaway, searchMulti,
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

export default function GiveawaysPage() {
  const { token, ready } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

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
      await createGiveaway(token, { title, description: desc, deadline: deadline || null });
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
        Как это работает: за каждую <span className="text-slate-300">оригинальную рецензию (от {minWords} слов)</span>,
        написанную <span className="text-slate-300">после старта</span> розыгрыша, начисляется 1 билетик 🎟.
        Старт — 0 билетиков; чем больше качественных рецензий, тем выше шанс.
        «Вода», набор слов и копии чужих рецензий не засчитываются. Рецензию победителя я проверяю вручную. Удалишь рецензию — билетик пропадёт.
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>
      )}

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

                {!closed && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {!token ? (
                      <Link href="/login" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 transition">
                        Войдите, чтобы участвовать
                      </Link>
                    ) : g.entered ? (
                      (g.my_tickets || 0) > 0 ? (
                        <span className="text-sm text-emerald-400">
                          ✓ Вы участвуете · <span className="font-semibold">{g.my_tickets} 🎟</span>
                          <span className="text-slate-500"> (билетики копятся за активность)</span>
                        </span>
                      ) : (
                        <span className="text-sm text-amber-400/90">
                          Вы записаны, но пока 0 🎟 — напишите рецензию от {minWords} слов, чтобы появился шанс
                        </span>
                      )
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
