"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getMovies, getRecent } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const POSTER = (path) =>
  path ? `https://image.tmdb.org/t/p/w342${path}` : null;

function ScoreBadge({ score }) {
  const color =
    score >= 7.5
      ? "text-emerald-400"
      : score >= 5.5
      ? "text-amber-400"
      : "text-red-400";
  return (
    <span className={`text-lg font-bold ${color}`}>
      {score > 0 ? score.toFixed(1) : "—"}
    </span>
  );
}

function MovieCard({ movie }) {
  return (
    <Link href={`/movies/${movie.id}`}>
      <div
        className="rounded-xl overflow-hidden border transition-all hover:scale-[1.02] hover:border-amber-400/40 cursor-pointer"
        style={{ background: "#141d2e", borderColor: "#1e2d45" }}
      >
        <div className="relative h-52 bg-slate-800 overflow-hidden">
          {POSTER(movie.poster) ? (
            <img
              src={POSTER(movie.poster)}
              alt={movie.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-600 text-4xl">
              🎬
            </div>
          )}
        </div>
        <div className="p-3">
          <div className="text-sm font-semibold text-slate-100 line-clamp-1">
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

function RecentCard({ item }) {
  return (
    <div
      className="flex gap-3 rounded-xl p-3 border"
      style={{ background: "#141d2e", borderColor: "#1e2d45" }}
    >
      <div className="w-12 h-16 rounded-lg overflow-hidden shrink-0 bg-slate-800">
        {POSTER(item.poster) ? (
          <img
            src={POSTER(item.poster)}
            alt={item.movie_title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-600 text-xl">
            🎬
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <Link
          href={`/movies/${item.movie_id}`}
          className="text-sm font-semibold text-slate-100 hover:text-amber-400 transition-colors line-clamp-1"
        >
          {item.movie_title}
        </Link>
        <div className="flex items-center gap-2 mt-0.5">
          <Link
            href={`/profile/${item.user_id}`}
            className="text-xs text-amber-400 hover:underline"
          >
            {item.username}
          </Link>
          <span className="text-xs text-slate-500">·</span>
          <span className="text-xs font-bold text-emerald-400">
            {item.score?.toFixed(1)}
          </span>
        </div>
        {item.review && (
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.review}</p>
        )}
      </div>
    </div>
  );
}

export default function HomePage() {
  const { token } = useAuth();
  const [movies, setMovies] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getMovies(), getRecent()])
      .then(([m, r]) => {
        setMovies(m);
        setRecent(r);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-10">
      {/* Hero */}
      {!token && (
        <div className="text-center py-12">
          <h1 className="text-4xl font-bold text-slate-100 mb-3">
            Оценивай фильмы{" "}
            <span className="text-amber-400">объективно</span>
          </h1>
          <p className="text-slate-500 max-w-md mx-auto text-sm leading-relaxed">
            Шесть критериев оценки, умный алгоритм расчёта и полноценные рецензии —
            создай собственную критическую базу кинематографа.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mt-6">
            <Link
              href="/register"
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 transition"
            >
              Начать
            </Link>
            <Link
              href="/search"
              className="px-5 py-2.5 rounded-lg text-sm font-medium text-slate-300 border border-slate-700 hover:border-slate-500 transition"
            >
              Поиск фильмов
            </Link>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-slate-500 text-sm py-12">
          Загрузка...
        </div>
      ) : (
        <>
          {/* Recent activity */}
          {recent.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-slate-100 mb-4">
                Последние рецензии
              </h2>
              <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
                {recent.slice(0, 9).map((item, i) => (
                  <div key={i} className="shrink-0 w-72 snap-start">
                    <RecentCard item={item} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* All rated movies */}
          {movies.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-slate-100 mb-4">
                Оцененные фильмы
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {movies.map((m) => (
                  <MovieCard key={m.id} movie={m} />
                ))}
              </div>
            </section>
          )}

          {movies.length === 0 && recent.length === 0 && (
            <div className="text-center py-16">
              <div className="text-5xl mb-4">🎬</div>
              <p className="text-slate-500 text-sm">
                Пока нет оценённых фильмов.{" "}
                <Link href="/search" className="text-amber-400 hover:underline">
                  Найдите первый
                </Link>
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
