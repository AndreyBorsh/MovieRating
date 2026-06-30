"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMovies, getTvShows, getRecent, getReviews, getTvReviews, getGiveaways, enterGiveaway } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ReviewText, { stripMarkers } from "@/app/components/ReviewText";

function GiveawayBanner({ giveaways, token, onEntered }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!giveaways || giveaways.length === 0) return null;
  const g = giveaways[0];
  const more = giveaways.length - 1;

  const enter = async () => {
    setBusy(true); setErr("");
    try { await enterGiveaway(token, g.id); onEntered(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div
      className="rounded-2xl p-5 sm:p-6 border relative overflow-hidden"
      style={{
        background: "linear-gradient(110deg, #2a1f05 0%, #1a2b1a 55%, #141d2e 100%)",
        borderColor: "#5a4a14",
      }}
    >
      <div className="absolute -right-6 -top-6 text-[120px] opacity-10 select-none pointer-events-none">🎟</div>
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-wider text-amber-400 uppercase mb-1">
            🎬 Идёт розыгрыш билета в кино
          </div>
          <div className="text-xl sm:text-2xl font-bold text-slate-100 truncate">{g.title}</div>
          {g.description && <p className="text-sm text-slate-400 mt-1 line-clamp-1">{g.description}</p>}
          <p className="text-xs text-slate-500 mt-1">
            Участников: {g.entries}
            {more > 0 && <> · и ещё {more} {more === 1 ? "розыгрыш" : "розыгрыша"}</>}
          </p>
        </div>

        <div className="shrink-0 flex flex-col items-stretch sm:items-end gap-1.5">
          {!token ? (
            <Link href="/login" className="px-5 py-2.5 rounded-lg text-sm font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 transition text-center">
              Войти и участвовать
            </Link>
          ) : g.entered ? (
            <span className="text-sm text-emerald-400 font-medium text-center sm:text-right">
              ✓ Вы участвуете · {g.my_tickets ?? 0} 🎟
            </span>
          ) : (g.my_tickets || 0) > 0 ? (
            <button onClick={enter} disabled={busy}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 transition">
              {busy ? "..." : `🎟 Участвовать · ${g.my_tickets}`}
            </button>
          ) : (
            <span className="text-xs text-slate-400 text-center sm:text-right max-w-[220px]">
              Напишите рецензию от 100 слов после старта, чтобы получить билетик
            </span>
          )}
          <Link href="/giveaways" className="text-xs text-amber-400/80 hover:text-amber-300 transition text-center sm:text-right">
            Подробнее →
          </Link>
          {err && <span className="text-xs text-red-400">{err}</span>}
        </div>
      </div>
    </div>
  );
}

const POSTER = (path) =>
  path ? `/api/tmdb-image/w342${path}` : null;

// Movie criteria for modal
const MOVIE_CRITERIA = [
  { key: "overall",   label: "Общее",      weight: "35%", main: true },
  { key: "story",     label: "Сценарий",   weight: "20%" },
  { key: "direction", label: "Режиссура",  weight: "15%" },
  { key: "acting",    label: "Актёры",     weight: "15%" },
  { key: "visuals",   label: "Визуал",     weight: "10%" },
  { key: "music",     label: "Звук",       weight: "5%"  },
];

// TV criteria for modal
const TV_CRITERIA = [
  { key: "overall",    label: "Общее",      weight: "30%", main: true },
  { key: "story",      label: "Сценарий",   weight: "20%" },
  { key: "characters", label: "Персонажи",  weight: "20%" },
  { key: "acting",     label: "Актёры",     weight: "15%" },
  { key: "visuals",    label: "Визуал",     weight: "10%" },
  { key: "pacing",     label: "Темп",       weight: "5%"  },
];

const scoreColor = (n) =>
  n >= 7.5 ? "text-emerald-400" : n >= 5.5 ? "text-amber-400" : "text-red-400";

function ScoreBadge({ score }) {
  const color = scoreColor(score);
  return (
    <span className={`text-lg font-bold ${color}`}>
      {score > 0 ? score.toFixed(1) : "—"}
    </span>
  );
}

function CriteriaBar({ label, value, weight, main }) {
  const pct = ((value - 1) / 9) * 100;
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className={`w-20 shrink-0 ${main ? "text-amber-400 font-medium" : "text-slate-400"}`}>
        {label}
      </div>
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${main ? "bg-amber-400" : "bg-slate-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-5 text-right text-slate-300 font-semibold">{value}</div>
      <div className="w-7 text-right text-slate-600">{weight}</div>
    </div>
  );
}

function ReviewModal({ item, onClose }) {
  const { token } = useAuth();
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const isTV = item.media_type === "tv";
  const CRITERIA = isTV ? TV_CRITERIA : MOVIE_CRITERIA;
  const mediaHref = isTV ? `/tv/${item.movie_id}` : `/movies/${item.movie_id}`;

  useEffect(() => {
    const fetchFn = isTV ? getTvReviews : getReviews;
    fetchFn(item.movie_id, token)
      .then((reviews) => {
        const found = reviews.find((r) => r.user_id === item.user_id);
        setReview(found || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [item.movie_id, item.user_id, token, isTV]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border overflow-y-auto max-h-[90vh] p-5 space-y-4"
        style={{ background: "#141d2e", borderColor: "#1e2d45" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3 items-center min-w-0">
            {POSTER(item.poster) ? (
              <img
                src={POSTER(item.poster)}
                alt={item.movie_title}
                className="w-10 h-14 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="w-10 h-14 rounded-lg bg-slate-800 flex items-center justify-center text-slate-600 shrink-0">
                {isTV ? "📺" : "🎬"}
              </div>
            )}
            <div className="min-w-0">
              <Link
                href={mediaHref}
                onClick={onClose}
                className="text-sm font-semibold text-slate-100 hover:text-amber-400 transition-colors line-clamp-1"
              >
                {item.movie_title}
              </Link>
              <div className="flex items-center gap-2 mt-0.5">
                <Link
                  href={`/profile/${item.user_id}`}
                  onClick={onClose}
                  className="text-xs text-amber-400 hover:underline font-medium"
                >
                  {item.username}
                </Link>
                <span className="text-xs text-slate-500">·</span>
                <span className={`text-sm font-bold ${scoreColor(item.score)}`}>
                  {item.score?.toFixed(1)}
                </span>
                {isTV && (
                  <span className="text-xs text-amber-400/60 bg-amber-400/10 px-1.5 py-0.5 rounded">сериал</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 transition-colors text-lg leading-none shrink-0 mt-0.5"
          >
            ✕
          </button>
        </div>

        {/* Criteria */}
        {loading ? (
          <p className="text-xs text-slate-500">Загрузка...</p>
        ) : review ? (
          <div className="space-y-1.5">
            {CRITERIA.map((c) => (
              <CriteriaBar key={c.key} label={c.label} value={review[c.key]} weight={c.weight} main={c.main} />
            ))}
          </div>
        ) : null}

        {/* Review text */}
        {item.review && (
          <div className="border-t pt-3" style={{ borderColor: "#1e2d45" }}>
            <ReviewText text={item.review} />
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: "#1e2d45" }}>
          {item.created_at && (
            <span className="text-xs text-slate-600">
              {new Date(item.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
            </span>
          )}
          <Link
            href={mediaHref}
            onClick={onClose}
            className="text-xs text-amber-400 hover:text-amber-300 transition-colors ml-auto"
          >
            Перейти {isTV ? "к сериалу" : "к фильму"} →
          </Link>
        </div>
      </div>
    </div>
  );
}

function RecentCard({ item, onClick }) {
  const isTV = item.media_type === "tv";
  return (
    <div
      className="flex gap-3 rounded-xl p-3 border cursor-pointer hover:border-amber-400/40 transition-colors"
      style={{ background: "#141d2e", borderColor: "#1e2d45" }}
      onClick={onClick}
    >
      <div className="w-12 h-16 rounded-lg overflow-hidden shrink-0 bg-slate-800 relative">
        {POSTER(item.poster) ? (
          <img src={POSTER(item.poster)} alt={item.movie_title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600 text-xl">
            {isTV ? "📺" : "🎬"}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1">
          <p className="text-sm font-semibold text-slate-100 line-clamp-1 flex-1">{item.movie_title}</p>
          {isTV && (
            <span className="text-[10px] text-amber-400/70 bg-amber-400/10 px-1 py-0.5 rounded shrink-0 mt-0.5">
              сериал
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-amber-400 font-medium">{item.username}</span>
          <span className="text-xs text-slate-500">·</span>
          <span className={`text-xs font-bold ${scoreColor(item.score)}`}>{item.score?.toFixed(1)}</span>
        </div>
        {item.review && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{stripMarkers(item.review)}</p>
        )}
      </div>
    </div>
  );
}

function MediaCard({ item }) {
  const isTV = item.media_type === "tv";
  const legendary = item.score >= 9.5;
  const href = isTV ? `/tv/${item.id}` : `/movies/${item.id}`;

  return (
    <Link href={href}>
      <div
        className="rounded-xl overflow-hidden border transition-all hover:scale-[1.02] cursor-pointer"
        style={{
          background: legendary ? "linear-gradient(160deg, #1a1500 0%, #141d2e 60%)" : "#141d2e",
          borderColor: legendary ? "#b8860b" : "#1e2d45",
          boxShadow: legendary ? "0 0 14px 2px rgba(212,175,55,0.18)" : "none",
        }}
      >
        <div className="relative h-52 bg-slate-800 overflow-hidden">
          {POSTER(item.poster) ? (
            <img src={POSTER(item.poster)} alt={item.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-600 text-4xl">
              {isTV ? "📺" : "🎬"}
            </div>
          )}
          {legendary && (
            <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide"
                 style={{ background: "rgba(0,0,0,0.7)", color: "#d4af37", border: "1px solid #b8860b" }}>
              ★ ШЕДЕВР
            </div>
          )}
          {isTV && !legendary && (
            <div className="absolute top-2 right-2 bg-black/60 text-[10px] text-amber-400 px-1.5 py-0.5 rounded">
              сериал
            </div>
          )}
        </div>
        <div className="p-3">
          <div className={`text-sm font-semibold line-clamp-1 ${legendary ? "text-amber-200" : "text-slate-100"}`}>
            {item.title}
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <ScoreBadge score={item.score} />
            <span className="text-xs text-slate-500">{item.count} оценок</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const { token } = useAuth();
  const [movies,   setMovies]   = useState([]);
  const [tvShows,  setTvShows]  = useState([]);
  const [recent,   setRecent]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [modalItem, setModalItem] = useState(null);
  const [filter,   setFilter]   = useState("all");   // all | movie | tv
  const [sort,     setSort]     = useState("count");  // count | score | title | year
  const [giveaways, setGiveaways] = useState([]);

  useEffect(() => {
    Promise.all([getMovies(), getTvShows(), getRecent()])
      .then(([m, t, r]) => { setMovies(m); setTvShows(t); setRecent(r); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const loadGiveaways = () => {
    getGiveaways(token)
      .then((d) => setGiveaways((d?.items || []).filter((g) => g.status === "open")))
      .catch(() => {});
  };
  useEffect(() => { loadGiveaways(); /* eslint-disable-next-line */ }, [token]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setModalItem(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hasContent = movies.length > 0 || tvShows.length > 0 || recent.length > 0;

  const allItems = [...movies, ...tvShows];
  const filtered = allItems.filter((i) => filter === "all" || i.media_type === filter);
  const catalog = [...filtered].sort((a, b) => {
    if (sort === "title") return (a.title || "").localeCompare(b.title || "", "ru");
    if (sort === "year") return (b.year || 0) - (a.year || 0);
    if (sort === "score") return b.score - a.score || b.count - a.count;
    return b.count - a.count || b.score - a.score; // "count" (default)
  });

  const FILTER_TABS = [
    { key: "all",   label: "Все",      n: allItems.length },
    { key: "movie", label: "🎬 Фильмы", n: movies.length },
    { key: "tv",    label: "📺 Сериалы", n: tvShows.length },
  ];

  return (
    <div className="space-y-10">
      {modalItem && (
        <ReviewModal item={modalItem} onClose={() => setModalItem(null)} />
      )}

      <GiveawayBanner giveaways={giveaways} token={token} onEntered={loadGiveaways} />

      {!token && (
        <div className="text-center py-12">
          <h1 className="text-2xl sm:text-4xl font-bold text-slate-100 mb-3">
            Оценивай фильмы и сериалы <span className="text-amber-400">объективно</span>
          </h1>
          <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed">
            Шесть критериев оценки, умный алгоритм расчёта и полноценные рецензии —
            создай собственную критическую базу кинематографа.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mt-6">
            <Link href="/register" className="px-5 py-2.5 rounded-lg text-sm font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 transition">
              Начать
            </Link>
            <Link href="/search" className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-300 border border-slate-700 hover:border-slate-500 transition">
              Поиск фильмов и сериалов
            </Link>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-slate-500 text-sm py-12">Загрузка...</div>
      ) : (
        <>
          {recent.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-slate-100 mb-4">Последние рецензии</h2>
              <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-subtle">
                {recent.slice(0, 9).map((item, i) => (
                  <div key={i} className="shrink-0 w-72 snap-start">
                    <RecentCard item={item} onClick={() => setModalItem(item)} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {allItems.length > 0 && (
            <section>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 className="text-lg font-semibold text-slate-100">Каталог оценённого</h2>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500 hidden sm:inline">Сортировка:</label>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    className="text-sm text-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-amber-400/50"
                    style={{ background: "#0c1220", border: "1px solid #1e2d45" }}
                  >
                    <option value="count">По популярности</option>
                    <option value="score">По оценке</option>
                    <option value="year">Сначала новые</option>
                    <option value="title">По названию</option>
                  </select>
                </div>
              </div>

              {/* Filter tabs */}
              <div className="flex gap-1 p-1 rounded-lg w-fit mb-4" style={{ background: "#0c1220", border: "1px solid #1e2d45" }}>
                {FILTER_TABS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`px-3 sm:px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                      filter === f.key
                        ? "bg-amber-400 text-slate-900"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {f.label}
                    <span className={`ml-1.5 text-xs ${filter === f.key ? "text-slate-700" : "text-slate-600"}`}>
                      {f.n}
                    </span>
                  </button>
                ))}
              </div>

              {catalog.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {catalog.map((item) => (
                    <MediaCard key={`${item.media_type}-${item.id}`} item={item} />
                  ))}
                </div>
              ) : (
                <div className="text-center text-slate-500 text-sm py-8">
                  {filter === "tv" ? "Пока нет оценённых сериалов." : "Пока нет оценённых фильмов."}
                </div>
              )}
            </section>
          )}

          {!hasContent && (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">🎬</div>
              <p className="text-slate-500 text-sm">
                Пока нет оценённых фильмов и сериалов.{" "}
                <Link href="/search" className="text-amber-400 hover:underline">Найдите первый</Link>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
