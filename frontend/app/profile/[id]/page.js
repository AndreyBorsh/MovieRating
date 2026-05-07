"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getProfile } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const POSTER = (p) => p && `/api/tmdb-image/w185${p}`;

const CRITERIA_LABELS = {
  overall:   "Общее впечатление",
  story:     "Сценарий",
  direction: "Режиссура",
  acting:    "Актёрская игра",
  visuals:   "Операторская работа",
  music:     "Музыка и звук",
};

function ScoreBadge({ score }) {
  const n = parseFloat(score);
  const color =
    n >= 7.5 ? "text-emerald-400" : n >= 5.5 ? "text-amber-400" : "text-red-400";
  return (
    <span className={`text-xl font-bold ${color}`}>
      {n > 0 ? n.toFixed(1) : "—"}
    </span>
  );
}

export default function ProfilePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getProfile(id)
      .then(setProfile)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-slate-500 text-sm">Загрузка...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-16 text-slate-500">
        Профиль не найден
      </div>
    );
  }

  const isMe = user && user.user_id === profile.user_id;
  const joined = profile.joined
    ? new Date(profile.joined).toLocaleDateString("ru-RU", {
        month: "long",
        year: "numeric",
      })
    : null;

  const avgScore =
    profile.ratings.length > 0
      ? (
          profile.ratings.reduce((s, r) => s + r.score, 0) /
          profile.ratings.length
        ).toFixed(1)
      : null;

  return (
    <div className="space-y-8">
      {/* Profile header */}
      <div
        className="rounded-xl p-6 border flex items-center gap-6"
        style={{ background: "#141d2e", borderColor: "#1e2d45" }}
      >
        <div className="w-16 h-16 rounded-full bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-2xl text-amber-400 font-bold shrink-0">
          {profile.username.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-100">
            {profile.username}
            {isMe && (
              <span className="ml-2 text-xs font-normal text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                вы
              </span>
            )}
          </h1>
          {joined && (
            <div className="text-sm text-slate-500 mt-0.5">
              На платформе с {joined}
            </div>
          )}
          <div className="flex gap-4 mt-2 text-sm text-slate-400">
            <span>
              <span className="text-slate-100 font-semibold">
                {profile.ratings.length}
              </span>{" "}
              рецензий
            </span>
            {avgScore && (
              <span>
                средняя оценка{" "}
                <span className="text-amber-400 font-semibold">{avgScore}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Ratings list */}
      {profile.ratings.length === 0 ? (
        <div
          className="rounded-xl p-8 border text-center text-slate-500 text-sm"
          style={{ background: "#141d2e", borderColor: "#1e2d45" }}
        >
          {isMe
            ? "Вы ещё не оценивали фильмы. Найдите что-нибудь в поиске!"
            : "Пользователь пока не оставил ни одной рецензии."}
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-100">Рецензии</h2>
          {profile.ratings.map((r, idx) => (
            <div
              key={idx}
              className="rounded-xl border overflow-hidden"
              style={{ background: "#141d2e", borderColor: "#1e2d45" }}
            >
              <div className="flex gap-4 p-4">
                {/* Poster */}
                <Link href={`/movies/${r.movie_id}`} className="shrink-0">
                  {POSTER(r.poster) ? (
                    <img
                      src={POSTER(r.poster)}
                      alt={r.movie_title}
                      className="w-16 h-24 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-16 h-24 rounded-lg bg-slate-800 flex items-center justify-center text-slate-600 text-2xl">
                      🎬
                    </div>
                  )}
                </Link>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/movies/${r.movie_id}`}
                      className="text-base font-semibold text-slate-100 hover:text-amber-400 transition-colors line-clamp-1"
                    >
                      {r.movie_title}
                    </Link>
                    <ScoreBadge score={r.score} />
                  </div>

                  {/* Mini criteria bars */}
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    {Object.entries(CRITERIA_LABELS).map(([k, label]) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="text-xs text-slate-600 w-20 shrink-0">
                          {label.split(" ")[0]}
                        </span>
                        <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${k === "overall" ? "bg-amber-400" : "bg-slate-500"}`}
                            style={{ width: `${((r[k] - 1) / 9) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 w-4 text-right">
                          {r[k]}
                        </span>
                      </div>
                    ))}
                  </div>

                  {r.review && (
                    <p className="text-sm text-slate-400 mt-2 line-clamp-3">
                      {r.review}
                    </p>
                  )}

                  <div className="text-xs text-slate-600 mt-2">
                    {r.created_at
                      ? new Date(r.created_at).toLocaleDateString("ru-RU", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })
                      : ""}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
