"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { searchMovies } from "@/lib/api";

const POSTER = (path) =>
  path ? `/api/tmdb-image/w342${path}` : null;

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ    = searchParams.get("q") || "";
  const initialType = searchParams.get("type") || "movie";

  const [query,    setQuery]    = useState(initialQ);
  const [type,     setType]     = useState(initialType);
  const [results,  setResults]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef(null);

  // Auto-search when arriving from another page with ?q=...
  useEffect(() => {
    if (initialQ) {
      setSearched(true);
      setLoading(true);
      searchMovies(initialQ, initialType)
        .then((data) => setResults(Array.isArray(data) ? data : []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }
  }, []);

  const doSearch = async (overrideType) => {
    const q = query.trim();
    if (!q) return;
    const t = overrideType ?? type;
    router.replace(`/search?q=${encodeURIComponent(q)}&type=${t}`);
    setLoading(true);
    setSearched(true);
    try {
      const data = await searchMovies(q, t);
      setResults(Array.isArray(data) ? data : []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const switchType = (newType) => {
    setType(newType);
    setResults([]);
    setSearched(false);
    if (query.trim()) {
      doSearch(newType);
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter") doSearch();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100 mb-1">Поиск</h1>
        <p className="text-sm text-slate-500">Найдите фильм или сериал и оставьте свою оценку</p>
      </div>

      {/* Type toggle */}
      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: "#0c1220", border: "1px solid #1e2d45" }}>
        <button
          onClick={() => switchType("movie")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
            type === "movie"
              ? "bg-amber-400 text-slate-900"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          🎬 Фильмы
        </button>
        <button
          onClick={() => switchType("tv")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
            type === "tv"
              ? "bg-amber-400 text-slate-900"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          📺 Сериалы
        </button>
      </div>

      {/* Search input */}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder={type === "tv" ? "Название сериала..." : "Название фильма..."}
          className="flex-1 rounded-lg px-4 py-2.5 text-sm text-slate-100 outline-none focus:ring-1 focus:ring-amber-400/50 transition"
          style={{ background: "#141d2e", border: "1px solid #1e2d45" }}
          autoFocus
        />
        <button
          onClick={() => doSearch()}
          disabled={loading}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 transition shrink-0"
        >
          {loading ? "..." : "Найти"}
        </button>
      </div>

      {loading && (
        <div className="text-center text-slate-500 text-sm py-8">Поиск...</div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="text-center text-slate-500 text-sm py-8">
          Ничего не найдено по запросу «{query}»
        </div>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {results.map((item) => {
            const href = item.media_type === "tv"
              ? `/tv/${item.id}`
              : `/movies/${item.id}`;
            return (
              <Link
                key={item.id}
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
                  {item.media_type === "tv" && (
                    <div className="absolute top-2 right-2 bg-black/60 text-xs text-amber-400 px-1.5 py-0.5 rounded font-medium">
                      сериал
                    </div>
                  )}
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
