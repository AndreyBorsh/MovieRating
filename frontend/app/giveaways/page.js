"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  getGiveaways, enterGiveaway, createGiveaway, drawGiveaway, deleteGiveaway,
} from "@/lib/api";

function fmtDate(s) {
  if (!s) return null;
  return new Date(s).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
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
    try { const r = await drawGiveaway(token, id); alert(`Победитель: ${r.winner_name} 🎉`); load(); }
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
        <h1 className="text-2xl font-bold text-slate-100 mb-1">🎟 Розыгрыши билетов</h1>
        <p className="text-sm text-slate-500">
          Будь активен — пиши развёрнутые рецензии и комментируй — и участвуй в розыгрыше билетов в кино.
        </p>
      </div>

      {token && (
        <div className="rounded-xl px-4 py-3 border text-sm" style={{ background: "#141d2e", borderColor: "#1e2d45" }}>
          {data?.eligible ? (
            <span className="text-slate-300">
              Ваши шансы: <span className="text-amber-400 font-semibold">{data.my_potential_tickets} 🎟</span>
              <span className="text-slate-500"> — чем больше качественных рецензий и комментариев, тем выше шанс.</span>
            </span>
          ) : (
            <span className="text-slate-400">
              Чтобы участвовать, напишите хотя бы одну рецензию от {minWords} слов. Активность в комментариях повышает шансы.
            </span>
          )}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>
      )}

      {isAdmin && (
        <div className="rounded-xl p-4 border space-y-3" style={{ background: "#0c1220", borderColor: "#1e2d45" }}>
          <div className="text-sm font-semibold text-amber-400">Админ · создать розыгрыш</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название фильма"
            className="w-full rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-amber-400/50"
            style={{ background: "#141d2e", border: "1px solid #1e2d45" }} />
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
                </div>

                {closed && g.winner_name && (
                  <div className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ background: "#0c1220", border: "1px solid #1e2d45" }}>
                    🏆 Победитель: <span className="text-amber-400 font-semibold">{g.winner_name}</span>
                  </div>
                )}

                {!closed && (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {!token ? (
                      <Link href="/login" className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 transition">
                        Войдите, чтобы участвовать
                      </Link>
                    ) : g.my_tickets != null ? (
                      <span className="text-sm text-emerald-400">✓ Вы участвуете · {g.my_tickets} 🎟</span>
                    ) : (
                      <button onClick={() => enter(g.id)} disabled={busyId === g.id || !data?.eligible}
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 transition">
                        {busyId === g.id ? "..." : data?.eligible ? "Участвовать" : "Нужна рецензия от " + minWords + " слов"}
                      </button>
                    )}

                    {isAdmin && (
                      <>
                        <button onClick={() => draw(g.id)} disabled={busyId === g.id}
                          className="px-3 py-2 rounded-lg text-sm font-medium text-slate-300 border border-slate-700 hover:border-amber-400/50 hover:text-amber-400 transition">
                          🎲 Разыграть
                        </button>
                        <button onClick={() => remove(g.id)}
                          className="px-3 py-2 rounded-lg text-sm text-slate-500 border border-slate-700 hover:border-red-400/50 hover:text-red-400 transition">
                          🗑
                        </button>
                      </>
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
