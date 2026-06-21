"use client";

import { useState, useEffect } from "react";
import { getWatch } from "@/lib/api";

const LOGO = (p) => p && `/api/tmdb-image/w45${p}`;

function Logos({ items }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((p, i) =>
        p.logo ? (
          <img
            key={i}
            src={LOGO(p.logo)}
            alt={p.name}
            title={p.name}
            className="w-7 h-7 rounded-md object-cover"
          />
        ) : (
          <span key={i} className="text-xs text-slate-400">{p.name}</span>
        )
      )}
    </div>
  );
}

export default function WatchProviders({ mediaType, mediaId }) {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!mediaId) return;
    let alive = true;
    getWatch(mediaType, mediaId).then((d) => {
      if (!alive) return;
      setData(d);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [mediaType, mediaId]);

  if (!loaded || !data) return null;

  const { link, free = [], subscription = [], paid = [], region } = data;
  if (!free.length && !subscription.length && !paid.length && !link) return null;

  const hasFree = free.length > 0;

  return (
    <div
      className="rounded-xl p-4 border space-y-3"
      style={{ background: "#141d2e", borderColor: hasFree ? "#1f6b4a" : "#1e2d45" }}
    >
      {hasFree ? (
        <>
          <div className="text-sm font-semibold text-emerald-400">🍿 Смотреть бесплатно</div>
          <Logos items={free} />
        </>
      ) : (
        <div className="text-sm font-semibold text-slate-200">Где посмотреть</div>
      )}

      {!hasFree && subscription.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs text-slate-500">По подписке</div>
          <Logos items={subscription} />
        </div>
      )}

      {!hasFree && subscription.length === 0 && paid.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs text-slate-500">Аренда / покупка</div>
          <Logos items={paid} />
        </div>
      )}

      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className={`block text-center w-full py-2 rounded-lg text-sm font-semibold transition ${
            hasFree
              ? "text-slate-900 bg-emerald-400 hover:bg-emerald-300"
              : "text-slate-200 border border-slate-600 hover:border-amber-400/50 hover:text-amber-400"
          }`}
        >
          {hasFree ? "Перейти к просмотру →" : "Где посмотреть →"}
        </a>
      )}

      <p className="text-[10px] text-slate-600">
        Легальные площадки · данные JustWatch{region && region !== "RU" ? ` · регион ${region}` : ""}
      </p>
    </div>
  );
}
