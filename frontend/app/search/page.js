"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { searchMulti } from "@/lib/api";

const POSTER = (path) =>
  path ? `/api/tmdb-image/w342${path}` : null;

const FILTERS = [
  { key: "all",   label: "Все" },
  { key: "movie", label: "🎬 Фильмы" },
  { key: "tv",    label: "📺 Сериалы" },
];

function SearchContent() {
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q") || "";

  const [query,   setQuery]   = useState(initialQ);
  const [filter,  setFilter]  = useState("all");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const reqId = useRef(0);

  // Live search with debounce
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    const myId = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const data = await searchMulti(q);
        if (myId !== reqId.current) return; // stale response, ignore
        setResults(Array.isArray(data) ? data : []);
        setSearched(true);
      } catch {
        if (myId === reqId.current) setResults([]);
      } finally {
        if (myId === reqId.current) setLoading(false);
      }
    }, 350);

    return () => clearTimeout(t);
  }, [query]);

  const shown = results.filter((r) => filter === "all" || r.media_type === filter);
  const movieCount = results.filter((r) => r.media_type === "movie").length;
  const tvCount = results.filter((r) => r.media_type === "tv").length;

  const countFor = (key) =>
    key === "all" ? results.length : key === "movie" ? movieCount : tvCount;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-stone-900 mb-1">Поиск</h1>
        <p className="text-sm text-stone-500">
          Начните вводить название — фильмы и сериалы появятся сразу
        </p>
      </div>

      {/* Search input */}
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Название фильма или сериала..."
          className="w-full rounded-xl px-5 py-3.5 pr-11 text-base text-stone-900 outline-none focus:ring-1 focus:ring-amber-400/50 transition"
          style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(0,0,0,0.08)" }}
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-800 transition"
            aria-label="Очистить"
          >
            ✕
          </button>
        )}
      </div>

      {/* Filter chips (only when there are results) */}
      {results.length > 0 && (
        <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: "#efe9df", border: "1px solid rgba(0,0,0,0.08)" }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 sm:px-4 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                filter === f.key
                  ? "bg-amber-400 text-stone-900"
                  : "text-stone-600 hover:text-stone-800"
              }`}
            >
              {f.label}
              <span className={`ml-1.5 text-xs ${filter === f.key ? "text-stone-700" : "text-stone-400"}`}>
                {countFor(f.key)}
              </span>
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="text-center text-stone-500 text-sm py-8">Поиск...</div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="text-center text-stone-500 text-sm py-8">
          Ничего не найдено по запросу «{query.trim()}»
        </div>
      )}

      {shown.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {shown.map((item) => {
            const href = item.media_type === "tv"
              ? `/tv/${item.id}`
              : `/movies/${item.id}`;
            return (
              <Link
                key={`${item.media_type}-${item.id}`}
                href={href}
                className="group glass glass-lift rounded-2xl overflow-hidden"
              >
                <div className="relative aspect-[2/3] bg-stone-200 overflow-hidden">
                  {POSTER(item.poster) ? (
                    <img
                      src={POSTER(item.poster)}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-400 text-4xl">
                      {item.media_type === "tv" ? "📺" : "🎬"}
                    </div>
                  )}
                  {item.year && (
                    <div className="absolute top-2 left-2 text-xs font-medium text-stone-700 px-2 py-0.5 rounded-full backdrop-blur-sm" style={{ background: "rgba(255,255,255,0.8)" }}>
                      {item.year}
                    </div>
                  )}
                  <div className={`absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full font-medium backdrop-blur-sm ${item.media_type === "tv" ? "text-amber-700" : "text-sky-700"}`} style={{ background: "rgba(255,255,255,0.8)" }}>
                    {item.media_type === "tv" ? "сериал" : "фильм"}
                  </div>
                </div>
                <div className="p-3">
                  <div className="text-sm font-bold tracking-tight text-stone-900 line-clamp-2 group-hover:text-amber-600 transition-colors">
                    {item.title}
                  </div>
                  {item.overview && (
                    <p className="text-xs text-stone-500 mt-1 line-clamp-2">
                      {item.overview}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense>
      <SearchContent />
    </Suspense>
  );
}
