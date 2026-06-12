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
        <h1 className="text-2xl font-bold text-slate-100 mb-1">Поиск</h1>
        <p className="text-sm text-slate-500">
          Начните вводить название — фильмы и сериалы появятся сразу
        </p>
      </div>

      {/* Search input */}
      <div className="relative">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Название фильма или сериала..."
          className="w-full rounded-lg px-4 py-2.5 pr-10 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-amber-400/50 transition"
          style={{ background: "#141d2e", border: "1px solid #1e2d45" }}
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 transition"
            aria-label="Очистить"
          >
            ✕
          </button>
        )}
      </div>

      {/* Filter chips (only when there are results) */}
      {results.length > 0 && (
        <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: "#0c1220", border: "1px solid #1e2d45" }}>
          {FILTERS.map((f) => (
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
                {countFor(f.key)}
              </span>
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="text-center text-slate-500 text-sm py-8">Поиск...</div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="text-center text-slate-500 text-sm py-8">
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
                className="group rounded-xl overflow-hidden border transition-all hover:border-amber-400/40"
                style={{ background: "#141d2e", borderColor: "#1e2d45" }}
              >
                <div className="relative h-52 bg-slate-800 overflow-hidden">
                  {POSTER(item.poster) ? (
                    <img
                      src={POSTER(item.poster)}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-600 text-4xl">
                      {item.media_type === "tv" ? "📺" : "🎬"}
                    </div>
                  )}
                  {item.year && (
                    <div className="absolute top-2 left-2 bg-black/60 text-xs text-slate-300 px-1.5 py-0.5 rounded">
                      {item.year}
                    </div>
                  )}
                  <div className={`absolute top-2 right-2 bg-black/60 text-xs px-1.5 py-0.5 rounded font-medium ${item.media_type === "tv" ? "text-amber-400" : "text-sky-300"}`}>
                    {item.media_type === "tv" ? "сериал" : "фильм"}
                  </div>
                </div>
                <div className="p-3">
                  <div className="text-sm font-semibold text-slate-100 line-clamp-2 group-hover:text-amber-400 transition-colors">
                    {item.title}
                  </div>
                  {item.overview && (
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
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
