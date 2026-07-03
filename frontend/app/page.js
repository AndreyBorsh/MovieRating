"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMovies, getTvShows, getRecent, getReviews, getTvReviews, getGiveaways, enterGiveaway } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ReviewText, { stripMarkers } from "@/app/components/ReviewText";
import ScoreBadge, { scoreColor } from "@/app/components/Score";

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
      className="glass rounded-3xl p-5 sm:p-6 relative overflow-hidden"
      style={{ background: "linear-gradient(120deg, rgba(245,196,81,0.22) 0%, rgba(255,255,255,0.7) 55%)" }}
    >
      <div className="absolute -right-4 -top-6 text-[120px] opacity-[0.08] select-none pointer-events-none">🎟</div>
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-[0.12em] text-amber-700 uppercase mb-1.5">
            Идёт розыгрыш билета в кино
          </div>
          <div className="text-xl sm:text-2xl font-extrabold tracking-tight text-stone-900 truncate">{g.title}</div>
          {g.description && <p className="text-sm text-stone-600 mt-1 line-clamp-1">{g.description}</p>}
          <p className="text-xs text-stone-500 mt-1.5">
            Участников: {g.entries}
            {more > 0 && <> · и ещё {more} {more === 1 ? "розыгрыш" : "розыгрыша"}</>}
          </p>
        </div>

        <div className="shrink-0 flex flex-col items-stretch sm:items-end gap-2">
          {!token ? (
            <Link href="/login" className="px-5 py-2.5 rounded-full text-sm font-semibold text-stone-900 bg-gradient-to-br from-amber-300 to-amber-500 shadow-[0_6px_18px_rgba(210,154,60,0.35)] hover:brightness-105 transition text-center">
              Войти и участвовать
            </Link>
          ) : g.entered ? (
            <span className="text-sm text-emerald-600 font-semibold text-center sm:text-right">
              ✓ Вы участвуете · {g.my_tickets ?? 0} 🎟
            </span>
          ) : (g.my_tickets || 0) > 0 ? (
            <button onClick={enter} disabled={busy}
              className="px-5 py-2.5 rounded-full text-sm font-semibold text-stone-900 bg-gradient-to-br from-amber-300 to-amber-500 shadow-[0_6px_18px_rgba(210,154,60,0.35)] hover:brightness-105 disabled:opacity-50 transition">
              {busy ? "..." : `🎟 Участвовать · ${g.my_tickets}`}
            </button>
          ) : (
            <span className="text-xs text-stone-600 text-center sm:text-right max-w-[220px]">
              Напишите рецензию от 100 слов после старта, чтобы получить билетик
            </span>
          )}
          <Link href="/giveaways" className="text-xs font-medium text-amber-700 hover:text-amber-600 transition text-center sm:text-right">
            Подробнее →
          </Link>
          {err && <span className="text-xs text-rose-500">{err}</span>}
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

function CriteriaBar({ label, value, weight, main }) {
  const pct = ((value - 1) / 9) * 100;
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className={`w-20 shrink-0 ${main ? "text-amber-600 font-medium" : "text-stone-600"}`}>
        {label}
      </div>
      <div className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${main ? "bg-amber-400" : "bg-stone-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="w-5 text-right text-stone-700 font-semibold">{value}</div>
      <div className="w-7 text-right text-stone-400">{weight}</div>
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
      style={{ background: "rgba(30,22,12,0.55)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border overflow-y-auto max-h-[90vh] p-5 space-y-4"
        style={{ background: "#fbf9f4", borderColor: "rgba(0,0,0,0.06)", boxShadow: "0 24px 60px rgba(40,30,15,0.28)" }}
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
              <div className="w-10 h-14 rounded-lg bg-stone-200 flex items-center justify-center text-stone-400 shrink-0">
                {isTV ? "📺" : "🎬"}
              </div>
            )}
            <div className="min-w-0">
              <Link
                href={mediaHref}
                onClick={onClose}
                className="text-sm font-semibold text-stone-900 hover:text-amber-600 transition-colors line-clamp-1"
              >
                {item.movie_title}
              </Link>
              <div className="flex items-center gap-2 mt-0.5">
                <Link
                  href={`/profile/${item.user_id}`}
                  onClick={onClose}
                  className="text-xs text-amber-600 hover:underline font-medium"
                >
                  {item.username}
                </Link>
                <span className="text-xs text-stone-500">·</span>
                <span className={`text-sm font-display font-medium ${scoreColor(item.score)}`}>
                  {item.score?.toFixed(1)}
                </span>
                {isTV && (
                  <span className="text-xs text-amber-600 bg-amber-400/10 px-1.5 py-0.5 rounded">сериал</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-500 hover:text-stone-800 transition-colors text-lg leading-none shrink-0 mt-0.5"
          >
            ✕
          </button>
        </div>

        {/* Criteria */}
        {loading ? (
          <p className="text-xs text-stone-500">Загрузка...</p>
        ) : review ? (
          <div className="space-y-1.5">
            {CRITERIA.map((c) => (
              <CriteriaBar key={c.key} label={c.label} value={review[c.key]} weight={c.weight} main={c.main} />
            ))}
          </div>
        ) : null}

        {/* Review text */}
        {item.review && (
          <div className="border-t pt-3" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
            <ReviewText text={item.review} />
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          {item.created_at && (
            <span className="text-xs text-stone-400">
              {new Date(item.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
            </span>
          )}
          <Link
            href={mediaHref}
            onClick={onClose}
            className="text-xs text-amber-600 hover:text-amber-500 transition-colors ml-auto"
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
      className="glass glass-lift flex gap-3 rounded-2xl p-3 cursor-pointer h-full"
      onClick={onClick}
    >
      <div className="w-12 h-16 rounded-lg overflow-hidden shrink-0 bg-stone-200 relative">
        {POSTER(item.poster) ? (
          <img src={POSTER(item.poster)} alt={item.movie_title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-400 text-xl">
            {isTV ? "📺" : "🎬"}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1">
          <p className="text-sm font-bold tracking-tight text-stone-900 line-clamp-1 flex-1">{item.movie_title}</p>
          {isTV && (
            <span className="text-[10px] text-amber-700 bg-amber-400/15 px-1.5 py-0.5 rounded-full shrink-0 mt-0.5">
              сериал
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-amber-700 font-semibold">{item.username}</span>
          <span className="text-xs text-stone-400">·</span>
          <span className={`text-xs font-bold ${scoreColor(item.score)}`}>{item.score?.toFixed(1)}</span>
        </div>
        {item.review && (
          <p className="text-xs text-stone-500 mt-1 line-clamp-2">{stripMarkers(item.review)}</p>
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
        className="glass glass-lift rounded-2xl overflow-hidden cursor-pointer"
        style={legendary ? { boxShadow: "0 8px 26px rgba(212,175,55,0.28)", borderColor: "rgba(210,154,60,0.45)" } : undefined}
      >
        <div className="relative aspect-[2/3] bg-stone-200 overflow-hidden">
          {POSTER(item.poster) ? (
            <img src={POSTER(item.poster)} alt={item.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-stone-400 text-4xl">
              {isTV ? "📺" : "🎬"}
            </div>
          )}
          {legendary && (
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide backdrop-blur-md"
                 style={{ background: "rgba(255,255,255,0.85)", color: "#9a6a10" }}>
              ★ ШЕДЕВР
            </div>
          )}
          {isTV && !legendary && (
            <div className="absolute top-2 right-2 text-[10px] font-medium text-amber-700 px-2 py-0.5 rounded-full backdrop-blur-md" style={{ background: "rgba(255,255,255,0.8)" }}>
              сериал
            </div>
          )}
          <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-full backdrop-blur-md" style={{ background: "rgba(255,255,255,0.85)", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
            <span className={`text-sm font-bold ${scoreColor(item.score)}`}>{item.score > 0 ? item.score.toFixed(1) : "—"}</span>
          </div>
        </div>
        <div className="p-3">
          <div className="text-sm font-bold tracking-tight line-clamp-1 text-stone-900">
            {item.title}
          </div>
          <div className="text-xs text-stone-400 mt-0.5">{item.count} оценок</div>
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
      // active = open and deadline not passed (expired ones stop inviting participation)
      .then((d) => setGiveaways((d?.items || []).filter((g) => g.status === "open" && !g.expired)))
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
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-stone-900 mb-4 leading-[1.05]">
            Оценивай фильмы и сериалы <span className="text-amber-600">объективно</span>
          </h1>
          <p className="text-stone-500 max-w-md mx-auto text-sm sm:text-base leading-relaxed">
            Шесть критериев оценки, умный алгоритм расчёта и полноценные рецензии —
            создай собственную критическую базу кинематографа.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mt-7">
            <Link href="/register" className="px-6 py-3 rounded-full text-sm font-semibold text-stone-900 bg-gradient-to-br from-amber-300 to-amber-500 shadow-[0_6px_20px_rgba(210,154,60,0.4)] hover:brightness-105 transition">
              Начать
            </Link>
            <Link href="/search" className="glass px-6 py-3 rounded-full text-sm font-medium text-stone-700 hover:brightness-[0.98] transition">
              Поиск фильмов и сериалов
            </Link>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-stone-500 text-sm py-12">Загрузка...</div>
      ) : (
        <>
          {recent.length > 0 && (
            <section>
              <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-stone-900 mb-4">Последние рецензии</h2>
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
                <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-stone-900">Каталог оценённого</h2>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-stone-500 hidden sm:inline">Сортировка:</label>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                    className="glass text-sm text-stone-800 rounded-full px-3.5 py-2 outline-none focus:ring-1 focus:ring-amber-400/50"
                  >
                    <option value="count">По популярности</option>
                    <option value="score">По оценке</option>
                    <option value="year">Сначала новые</option>
                    <option value="title">По названию</option>
                  </select>
                </div>
              </div>

              {/* Filter tabs */}
              <div className="glass flex gap-1 p-1 rounded-full w-fit mb-5">
                {FILTER_TABS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`px-3.5 sm:px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                      filter === f.key
                        ? "bg-gradient-to-br from-amber-300 to-amber-500 text-stone-900 shadow-[0_3px_10px_rgba(210,154,60,0.3)]"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    {f.label}
                    <span className={`ml-1.5 text-xs ${filter === f.key ? "text-stone-800/70" : "text-stone-400"}`}>
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
                <div className="text-center text-stone-500 text-sm py-8">
                  {filter === "tv" ? "Пока нет оценённых сериалов." : "Пока нет оценённых фильмов."}
                </div>
              )}
            </section>
          )}

          {!hasContent && (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">🎬</div>
              <p className="text-stone-500 text-sm">
                Пока нет оценённых фильмов и сериалов.{" "}
                <Link href="/search" className="text-amber-600 hover:underline">Найдите первый</Link>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
