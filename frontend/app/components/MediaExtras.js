"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { img } from "@/lib/base";

const BACKDROP = (p) => img("w780", p);
const BACKDROP_LG = (p) => img("w1280", p);
const PROFILE = (p) => img("w185", p);

function Chip({ children }) {
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full text-stone-700"
      style={{ background: "#efe9df", border: "1px solid rgba(0,0,0,0.08)" }}
    >
      {children}
    </span>
  );
}

const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};

export default function MediaExtras({ details, mediaType, variant = "all" }) {
  const backdrops = details?.backdrops || [];
  const [lbIndex, setLbIndex] = useState(null);
  const open = lbIndex !== null;

  const close = useCallback(() => setLbIndex(null), []);
  const prev = useCallback(
    () => setLbIndex((i) => (i - 1 + backdrops.length) % backdrops.length),
    [backdrops.length]
  );
  const next = useCallback(
    () => setLbIndex((i) => (i + 1) % backdrops.length),
    [backdrops.length]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, close, prev, next]);

  if (!details) return null;
  const showMeta = variant === "all" || variant === "meta";
  const showMedia = variant === "all" || variant === "media";

  const {
    genres = [],
    countries = [],
    runtime,
    episode_runtime,
    seasons,
    episodes,
    tagline,
    directors = [],
    creators = [],
    cast = [],
  } = details;

  const fmtRuntime = (min) => {
    if (!min) return null;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
  };

  const cleanTagline = tagline ? tagline.replace(/^[«»"'\s]+|[«»"'\s]+$/g, "") : "";

  // Build compact inline meta items
  const metaItems = [];
  if (countries.length) metaItems.push(countries.join(", "));
  if (mediaType === "movie" && runtime) metaItems.push(fmtRuntime(runtime));
  if (mediaType === "tv" && seasons != null) {
    let s = `${seasons} ${plural(seasons, "сезон", "сезона", "сезонов")}`;
    if (episodes != null) s += `, ${episodes} ${plural(episodes, "серия", "серии", "серий")}`;
    metaItems.push(s);
  }
  if (mediaType === "tv" && episode_runtime) metaItems.push(`~${episode_runtime} мин/серия`);
  if (mediaType === "movie" && directors.length)
    metaItems.push(`Реж.: ${directors.join(", ")}`);
  if (mediaType === "tv" && creators.length)
    metaItems.push(`${creators.length > 1 ? "Создатели" : "Создатель"}: ${creators.join(", ")}`);

  const hasMeta = genres.length || metaItems.length || cleanTagline;
  const hasAnything = hasMeta || backdrops.length || cast.length;
  if (!hasAnything) return null;

  return (
    <div className="space-y-5">
      {/* Compact meta block */}
      {showMeta && hasMeta && (
        <div
          className="rounded-xl px-4 py-3 border"
          style={{ background: "rgba(255,255,255,0.72)", borderColor: "rgba(0,0,0,0.08)" }}
        >
          {cleanTagline && (
            <p className="text-xs italic text-stone-500 mb-2">«{cleanTagline}»</p>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
            {genres.map((g) => (
              <Chip key={g}>{g}</Chip>
            ))}
            {metaItems.map((it, i) => (
              <span key={i} className="flex items-center gap-2 text-stone-600">
                {(genres.length > 0 || i > 0) && <span className="text-stone-700">·</span>}
                <span>{it}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Backdrop gallery (clickable → lightbox) */}
      {showMedia && backdrops.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-stone-900 mb-2">Кадры</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {backdrops.map((b, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setLbIndex(i)}
                className="shrink-0 rounded-lg overflow-hidden border border-transparent hover:border-amber-400/50 transition focus:outline-none"
              >
                <img
                  src={BACKDROP(b)}
                  alt={`Кадр ${i + 1}`}
                  loading="lazy"
                  className="h-24 object-cover"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cast */}
      {showMedia && cast.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-stone-900 mb-2">В ролях</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {cast.map((c, i) => {
              const inner = (
                <>
                  {c.photo ? (
                    <img
                      src={PROFILE(c.photo)}
                      alt={c.name}
                      loading="lazy"
                      className="w-20 h-28 rounded-lg object-cover mb-1 group-hover:brightness-95 transition"
                    />
                  ) : (
                    <div className="w-20 h-28 rounded-lg bg-stone-200 flex items-center justify-center text-2xl text-stone-400 mb-1">
                      👤
                    </div>
                  )}
                  <p className="text-xs text-stone-800 leading-tight line-clamp-2 group-hover:text-amber-600 transition-colors">{c.name}</p>
                  {c.character && (
                    <p className="text-[10px] text-stone-500 leading-tight line-clamp-2 mt-0.5">
                      {c.character}
                    </p>
                  )}
                </>
              );
              return c.id ? (
                <Link key={c.id} href={`/person/${c.id}`} className="shrink-0 w-20 text-center group">
                  {inner}
                </Link>
              ) : (
                <div key={i} className="shrink-0 w-20 text-center">{inner}</div>
              );
            })}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={close}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); close(); }}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center transition"
            aria-label="Закрыть"
          >
            ✕
          </button>

          {backdrops.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); prev(); }}
              className="absolute left-2 sm:left-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl flex items-center justify-center transition"
              aria-label="Предыдущий"
            >
              ‹
            </button>
          )}

          <img
            src={BACKDROP_LG(backdrops[lbIndex])}
            alt={`Кадр ${lbIndex + 1}`}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />

          {backdrops.length > 1 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="absolute right-2 sm:right-4 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white text-2xl flex items-center justify-center transition"
              aria-label="Следующий"
            >
              ›
            </button>
          )}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-white/70 bg-black/40 px-3 py-1 rounded-full">
            {lbIndex + 1} / {backdrops.length}
          </div>
        </div>
      )}
    </div>
  );
}
