"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMovies, getRecent, getReviews } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const POSTER = (path) =>
  path ? `/tmdb-image/w342${path}` : null;

const REVIEW_LIMIT = 300;

function ReviewText({ text }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > REVIEW_LIMIT;
  const displayed = isLong && !expanded ? text.slice(0, REVIEW_LIMIT).trimEnd() + "…" : text;
  return (
    <div className="text-sm text-slate-300 leading-relaxed">
      {displayed.split("\n").map((line, i, arr) => (
        <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
      ))}
      {isLong && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className="block mt-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
        >
          {expanded ? "Свернуть ↑" : "Читать дальше ↓"}
        </button>
      )}
    </div>
  );
}

const CRITERIA = [
  { key: "overall",   label: "Общее",     weight: "40%", main: true },
  { key: "story",     label: "Сценарий",  weight: "15%" },
  { key: "direction", label: "Режиссура", weight: "15%" },
  { key: "acting",    label: "Актёры",    weight: "15%" },
  { key: "visuals",   label: "Операторка",weight: "10%" },
  { key: "music",     label: "Музыка",    weight: "5%"  },
];

function ScoreBadge({ score }) {
  const color =
    score >= 7.5 ? "text-emerald-400" : score >= 5.5 ? "text-amber-400" : "text-red-400";
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

  useEffect(() => {
    getReviews(item.movie_id, token)
      .then((reviews) => {
        const found = reviews.find((r) => r.user_id === item.user_id);
        setReview(found || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [item.movie_id, item.user_id, token]);

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
              <div className="w-10 h-14 rounded-lg bg-slate-800 flex items-center justify-center text-slate-600 shrink-0">🎬</div>
            )}
            <div className="min-w-0">
              <Link
                href={`/movies/${item.movie_id}`}
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
                <span className={`text-sm font-bold ${item.score >= 7.5 ? "text-emerald-400" : item.score >= 5.5 ? "text-amber-400" : "text-red-400"}`}>
                  {item.score?.toFixed(1)}
                </span>
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
            href={`/movies/${item.movie_id}`}
            onClick={onClose}
            className="text-xs text-amber-400 hover:text-amber-300 transition-colors ml-auto"
          >
            Перейти к фильму →
          </Link>
        </div>
      </div>
    </div>
  );
}

function RecentCard({ item, onClick }) {
  return (
    <div
      className="flex gap-3 rounded-xl p-3 border cursor-pointer hover:border-amber-400/40 transition-colors"
      style={{ background: "#141d2e", borderColor: "#1e2d45" }}
      onClick={onClick}
    >
      <div className="w-12 h-16 rounded-lg overflow-hidden shrink-0 bg-slate-800">
        {POSTER(item.poster) ? (
          <img src={POSTER(item.poster)} alt={item.movie_title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600 text-xl">🎬</div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-100 line-clamp-1">{item.movie_title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-amber-400 font-medium">{item.username}</span>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs font-bold text-emerald-400">{item.score?.toFixed(1)}</span>
        </div>
        {item.review && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.review}</p>
        )}
      </div>
    </div>
  );
}

function MovieCard({ movie }) {
  const legendary = movie.score >= 9.5;
  return (
    <Link href={`/movies/${movie.id}`}>
      <div
        className="rounded-xl overflow-hidden border transition-all hover:scale-[1.02] cursor-pointer"
        style={{
          background: legendary ? "linear-gradient(160deg, #1a1500 0%, #141d2e 60%)" : "#141d2e",
          borderColor: legendary ? "#b8860b" : "#1e2d45",
          boxShadow: legendary ? "0 0 14px 2px rgba(212,175,55,0.18)" : "none",
        }}
      >
        <div className="relative h-52 bg-slate-800 overflow-hidden">
          {POSTER(movie.poster) ? (
            <img src={POSTER(movie.poster)} alt={movie.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-600 text-4xl">🎬</div>
          )}
          {legendary && (
            <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide"
                 style={{ background: "rgba(0,0,0,0.7)", color: "#d4af37", border: "1px solid #b8860b" }}>
              ★ ШЕДЕВР
            </div>
          )}
        </div>
        <div className="p-3">
          <div className={`text-sm font-semibold line-clamp-1 ${legendary ? "text-amber-200" : "text-slate-100"}`}>
            {movie.title}
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <ScoreBadge score={movie.score} />
            <span className="text-xs text-slate-500">{movie.count} оценок</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const { token } = useAuth();
  const [movies, setMovies] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalItem, setModalItem] = useState(null);

  useEffect(() => {
    Promise.all([getMovies(), getRecent()])
      .then(([m, r]) => { setMovies(m); setRecent(r); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setModalItem(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="space-y-10">
      {modalItem && (
        <ReviewModal item={modalItem} onClose={() => setModalItem(null)} />
      )}

      {!token && (
        <div className="text-center py-12">
          <h1 className="text-4xl font-bold text-slate-100 mb-3">
            Оценивай фильмы <span className="text-amber-400">объективно</span>
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
              Поиск фильмов
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

          {movies.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-slate-100 mb-4">Оцененные фильмы</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {movies.map((m) => <MovieCard key={m.id} movie={m} />)}
              </div>
            </section>
          )}

          {movies.length === 0 && recent.length === 0 && (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">🎬</div>
              <p className="text-slate-500 text-sm">
                Пока нет оценённых фильмов.{" "}
                <Link href="/search" className="text-amber-400 hover:underline">Найдите первый</Link>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
