"use client";

const BACKDROP = (p) => p && `/api/tmdb-image/w780${p}`;
const PROFILE = (p) => p && `/api/tmdb-image/w185${p}`;

function Chip({ children }) {
  return (
    <span
      className="text-xs px-2.5 py-1 rounded-full text-slate-300"
      style={{ background: "#0c1220", border: "1px solid #1e2d45" }}
    >
      {children}
    </span>
  );
}

export default function MediaExtras({ details, mediaType, variant = "all" }) {
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
    backdrops = [],
    cast = [],
  } = details;

  const hasMeta =
    genres.length || countries.length || runtime || episode_runtime ||
    seasons || directors.length || creators.length || tagline;

  const hasAnything = hasMeta || backdrops.length || cast.length;
  if (!hasAnything) return null;

  const fmtRuntime = (min) => {
    if (!min) return null;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
  };

  return (
    <div className="space-y-6">
      {/* Meta block */}
      {showMeta && hasMeta && (
        <div
          className="rounded-xl p-5 border space-y-3"
          style={{ background: "#141d2e", borderColor: "#1e2d45" }}
        >
          {tagline && (
            <p className="text-sm italic text-slate-400">«{tagline}»</p>
          )}

          {genres.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {genres.map((g) => (
                <Chip key={g}>{g}</Chip>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 text-sm">
            {countries.length > 0 && (
              <div>
                <div className="text-xs text-slate-600 mb-0.5">Страна</div>
                <div className="text-slate-300">{countries.join(", ")}</div>
              </div>
            )}
            {mediaType === "movie" && runtime && (
              <div>
                <div className="text-xs text-slate-600 mb-0.5">Длительность</div>
                <div className="text-slate-300">{fmtRuntime(runtime)}</div>
              </div>
            )}
            {mediaType === "tv" && seasons != null && (
              <div>
                <div className="text-xs text-slate-600 mb-0.5">Сезоны / серии</div>
                <div className="text-slate-300">
                  {seasons} / {episodes ?? "—"}
                </div>
              </div>
            )}
            {mediaType === "tv" && episode_runtime && (
              <div>
                <div className="text-xs text-slate-600 mb-0.5">Серия</div>
                <div className="text-slate-300">~{episode_runtime} мин</div>
              </div>
            )}
            {mediaType === "movie" && directors.length > 0 && (
              <div className="col-span-2">
                <div className="text-xs text-slate-600 mb-0.5">
                  {directors.length > 1 ? "Режиссёры" : "Режиссёр"}
                </div>
                <div className="text-slate-300">{directors.join(", ")}</div>
              </div>
            )}
            {mediaType === "tv" && creators.length > 0 && (
              <div className="col-span-2">
                <div className="text-xs text-slate-600 mb-0.5">
                  {creators.length > 1 ? "Создатели" : "Создатель"}
                </div>
                <div className="text-slate-300">{creators.join(", ")}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Backdrop gallery */}
      {showMedia && backdrops.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-slate-100 mb-2">Кадры</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {backdrops.map((b, i) => (
              <img
                key={i}
                src={BACKDROP(b)}
                alt={`Кадр ${i + 1}`}
                loading="lazy"
                className="h-24 rounded-lg object-cover shrink-0"
              />
            ))}
          </div>
        </div>
      )}

      {/* Cast */}
      {showMedia && cast.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-slate-100 mb-2">В ролях</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {cast.map((c, i) => (
              <div key={c.id ?? i} className="shrink-0 w-20 text-center">
                {c.photo ? (
                  <img
                    src={PROFILE(c.photo)}
                    alt={c.name}
                    loading="lazy"
                    className="w-20 h-28 rounded-lg object-cover mb-1"
                  />
                ) : (
                  <div className="w-20 h-28 rounded-lg bg-slate-800 flex items-center justify-center text-2xl text-slate-600 mb-1">
                    👤
                  </div>
                )}
                <p className="text-xs text-slate-200 leading-tight line-clamp-2">
                  {c.name}
                </p>
                {c.character && (
                  <p className="text-[10px] text-slate-500 leading-tight line-clamp-2 mt-0.5">
                    {c.character}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
