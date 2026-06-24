"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getProfile, getMyNotes } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ReviewText, { stripMarkers } from "@/app/components/ReviewText";

const POSTER = (p) => p && `/api/tmdb-image/w185${p}`;

const MOVIE_CRITERIA_LABELS = {
  overall:   "Общее",
  story:     "Сценарий",
  direction: "Режиссура",
  acting:    "Актёры",
  visuals:   "Визуал",
  music:     "Звук",
};

const TV_CRITERIA_LABELS = {
  overall:    "Общее",
  story:      "Сценарий",
  characters: "Персонажи",
  acting:     "Актёры",
  visuals:    "Визуал",
  pacing:     "Темп",
};

const scoreColor = (n) =>
  n >= 7.5 ? "text-emerald-400" : n >= 5.5 ? "text-amber-400" : "text-red-400";

const barColor = (n) =>
  n >= 7.5 ? "bg-emerald-400" : n >= 5.5 ? "bg-amber-400" : "bg-red-400";

function ScoreBadge({ score }) {
  const n = parseFloat(score);
  return (
    <span className={`text-xl font-bold ${scoreColor(n)}`}>
      {n > 0 ? n.toFixed(1) : "—"}
    </span>
  );
}

function Stat({ icon, value, label, color = "text-slate-100" }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 border"
      style={{ background: "#0c1220", borderColor: "#1e2d45" }}
    >
      <span className="text-lg leading-none">{icon}</span>
      <div className="leading-tight">
        <div className={`text-base font-bold ${color}`}>{value}</div>
        <div className="text-[10px] text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function ProfileStats({ ratings, onOpen }) {
  if (!ratings.length) return null;

  const scores = ratings.map((r) => r.score);
  const top = [...ratings].sort((a, b) => b.score - a.score).slice(0, 5);
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  const max = Math.max(...scores);
  const min = Math.min(...scores);

  const movieScores = ratings.filter((r) => r.media_type !== "tv").map((r) => r.score);
  const tvScores = ratings.filter((r) => r.media_type === "tv").map((r) => r.score);
  const avgOf = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
  const movieAvg = avgOf(movieScores);
  const tvAvg = avgOf(tvScores);

  // Histogram: round score into buckets 1..10
  const buckets = Array(10).fill(0);
  scores.forEach((s) => {
    const b = Math.min(10, Math.max(1, Math.round(s)));
    buckets[b - 1]++;
  });
  const maxBucket = Math.max(...buckets, 1);

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-100">Статистика</h2>

      <div className="flex flex-wrap gap-2">
        <Stat icon="⭐" value={avg.toFixed(1)} label="средняя" color={scoreColor(avg)} />
        <Stat icon="🔺" value={max.toFixed(1)} label="максимум" color={scoreColor(max)} />
        <Stat icon="🔻" value={min.toFixed(1)} label="минимум" color={scoreColor(min)} />
        <Stat icon="🎞️" value={ratings.length} label="всего" />
        {movieAvg != null && (
          <Stat icon="🎬" value={movieAvg.toFixed(1)} label="фильмы" color={scoreColor(movieAvg)} />
        )}
        {tvAvg != null && (
          <Stat icon="📺" value={tvAvg.toFixed(1)} label="сериалы" color={scoreColor(tvAvg)} />
        )}
      </div>

      {/* Score distribution */}
      <div
        className="rounded-xl px-4 py-3 border"
        style={{ background: "#141d2e", borderColor: "#1e2d45" }}
      >
        <div className="text-[11px] text-slate-500 mb-2">Распределение оценок</div>
        <div className="flex items-end gap-2 h-16">
          {buckets.map((count, i) => {
            const n = i + 1;
            const h = count > 0 ? Math.max(6, (count / maxBucket) * 100) : 3;
            return (
              <div key={n} className="flex-1 h-full flex justify-center items-end">
                <div
                  className={`w-2.5 sm:w-3.5 rounded-t ${count > 0 ? barColor(n) : "bg-slate-800"}`}
                  style={{ height: `${h}%` }}
                  title={`Оценка ${n}: ${count}`}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-1">
          {buckets.map((count, i) => (
            <span key={i} className="flex-1 text-center text-[10px] text-slate-600">
              {i + 1}
            </span>
          ))}
        </div>
      </div>

      {/* Top by score */}
      <div>
        <div className="text-[11px] text-slate-500 mb-2">Топ по оценке</div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {top.map((r, i) => (
            <button
              key={i}
              onClick={() => onOpen(r)}
              className="shrink-0 w-14 text-center group"
              title={r.movie_title}
            >
              {POSTER(r.poster) ? (
                <img
                  src={POSTER(r.poster)}
                  alt={r.movie_title}
                  className="w-14 h-20 rounded-lg object-cover border border-transparent group-hover:border-amber-400/50 transition"
                />
              ) : (
                <div className="w-14 h-20 rounded-lg bg-slate-800 flex items-center justify-center text-xl">
                  {r.media_type === "tv" ? "📺" : "🎬"}
                </div>
              )}
              <div className={`text-xs font-bold mt-0.5 ${scoreColor(r.score)}`}>
                {r.score.toFixed(1)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function CriteriaBars({ rating }) {
  const isTV = rating.media_type === "tv";
  const labels = isTV ? TV_CRITERIA_LABELS : MOVIE_CRITERIA_LABELS;
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
      {Object.entries(labels).map(([k, label]) => {
        const val = rating[k];
        if (val == null) return null;
        return (
          <div key={k} className="flex items-center gap-2">
            <span className="text-xs text-slate-600 w-20 shrink-0">{label}</span>
            <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${k === "overall" ? "bg-amber-400" : "bg-slate-500"}`}
                style={{ width: `${((val - 1) / 9) * 100}%` }}
              />
            </div>
            <span className="text-xs text-slate-400 w-4 text-right">{val}</span>
          </div>
        );
      })}
    </div>
  );
}

function ReviewModal({ rating, onClose }) {
  if (!rating) return null;
  const isTV = rating.media_type === "tv";
  const href = isTV ? `/tv/${rating.movie_id}` : `/movies/${rating.movie_id}`;
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
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3 min-w-0">
            {POSTER(rating.poster) ? (
              <img src={POSTER(rating.poster)} alt={rating.movie_title} className="w-14 h-20 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-14 h-20 rounded-lg bg-slate-800 flex items-center justify-center text-2xl shrink-0">
                {isTV ? "📺" : "🎬"}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-base font-semibold text-slate-100 leading-tight">{rating.movie_title}</div>
              {isTV && (
                <span className="text-xs text-amber-400/60 bg-amber-400/10 px-1.5 py-0.5 rounded mt-1 inline-block">сериал</span>
              )}
              <div className="mt-1"><ScoreBadge score={rating.score} /></div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition text-lg leading-none shrink-0">✕</button>
        </div>

        <CriteriaBars rating={rating} />

        {rating.review ? (
          <div className="border-t pt-3" style={{ borderColor: "#1e2d45" }}>
            <ReviewText text={rating.review} />
          </div>
        ) : (
          <div className="border-t pt-3 text-sm text-slate-600 italic" style={{ borderColor: "#1e2d45" }}>
            Без текстовой рецензии
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t pt-3" style={{ borderColor: "#1e2d45" }}>
          <span className="text-xs text-slate-600">
            {rating.created_at
              ? new Date(rating.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
              : ""}
          </span>
          <Link href={href} className="text-xs text-amber-400 hover:text-amber-300 transition shrink-0">
            Открыть страницу {isTV ? "сериала" : "фильма"} →
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { id } = useParams();
  const { user, token } = useAuth();
  const [openReview, setOpenReview] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    if (!id) return;
    getProfile(id)
      .then(setProfile)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  // Load own private notes only when viewing own profile
  const viewingOwn = user && profile && user.user_id === profile.user_id;
  useEffect(() => {
    if (viewingOwn && token) {
      getMyNotes(token).then((d) => setNotes(Array.isArray(d) ? d : [])).catch(() => {});
    }
  }, [viewingOwn, token]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setOpenReview(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const movieCount = profile.ratings.filter((r) => r.media_type !== "tv").length;
  const tvCount    = profile.ratings.filter((r) => r.media_type === "tv").length;

  return (
    <div className="space-y-8">
      {openReview && <ReviewModal rating={openReview} onClose={() => setOpenReview(null)} />}

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
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-400">
            {movieCount > 0 && (
              <span>
                <span className="text-slate-100 font-semibold">{movieCount}</span>{" "}
                {movieCount === 1 ? "фильм" : movieCount < 5 ? "фильма" : "фильмов"}
              </span>
            )}
            {tvCount > 0 && (
              <span>
                <span className="text-slate-100 font-semibold">{tvCount}</span>{" "}
                {tvCount === 1 ? "сериал" : tvCount < 5 ? "сериала" : "сериалов"}
              </span>
            )}
            {avgScore && (
              <span>
                средняя{" "}
                <span className="text-amber-400 font-semibold">{avgScore}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Statistics */}
      <ProfileStats ratings={profile.ratings} onOpen={setOpenReview} />

      {/* My private notes (own profile only) */}
      {isMe && notes.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            📝 Мои заметки
            <span className="text-xs font-normal text-slate-600">только вы их видите</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {notes.map((n) => {
              const href = n.media_type === "tv" ? `/tv/${n.media_id}` : `/movies/${n.media_id}`;
              return (
                <Link
                  key={`${n.media_type}-${n.media_id}`}
                  href={href}
                  className="flex gap-3 rounded-xl p-3 border hover:border-amber-400/40 transition-colors min-w-0"
                  style={{ background: "#141d2e", borderColor: "#1e2d45" }}
                >
                  {POSTER(n.poster) ? (
                    <img src={POSTER(n.poster)} alt={n.title || ""} className="w-12 h-16 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-16 rounded-lg bg-slate-800 flex items-center justify-center text-slate-600 shrink-0">
                      {n.media_type === "tv" ? "📺" : "🎬"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-slate-100 line-clamp-1">
                        {n.title || (n.media_type === "tv" ? "Сериал" : "Фильм")}
                      </p>
                      {n.media_type === "tv" && (
                        <span className="text-[10px] text-amber-400/70 bg-amber-400/10 px-1 py-0.5 rounded shrink-0">сериал</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2 whitespace-pre-wrap">{n.content}</p>
                    {n.updated_at && (
                      <p className="text-[10px] text-slate-600 mt-1">
                        {new Date(n.updated_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Ratings list */}
      {profile.ratings.length === 0 ? (
        <div
          className="rounded-xl p-8 border text-center text-slate-500 text-sm"
          style={{ background: "#141d2e", borderColor: "#1e2d45" }}
        >
          {isMe
            ? "Вы ещё не оценивали фильмы и сериалы. Найдите что-нибудь в поиске!"
            : "Пользователь пока не оставил ни одной рецензии."}
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-100">Рецензии</h2>
          {profile.ratings.map((r, idx) => {
            const isTV = r.media_type === "tv";
            const href = isTV ? `/tv/${r.movie_id}` : `/movies/${r.movie_id}`;
            return (
              <div
                key={idx}
                className="rounded-xl border overflow-hidden"
                style={{ background: "#141d2e", borderColor: "#1e2d45" }}
              >
                <div className="flex gap-4 p-4">
                  {/* Poster */}
                  <Link href={href} className="shrink-0">
                    {POSTER(r.poster) ? (
                      <img
                        src={POSTER(r.poster)}
                        alt={r.movie_title}
                        className="w-16 h-24 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-16 h-24 rounded-lg bg-slate-800 flex items-center justify-center text-slate-600 text-2xl">
                        {isTV ? "📺" : "🎬"}
                      </div>
                    )}
                  </Link>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={href}
                          className="text-base font-semibold text-slate-100 hover:text-amber-400 transition-colors line-clamp-1"
                        >
                          {r.movie_title}
                        </Link>
                        {isTV && (
                          <span className="text-xs text-amber-400/60 bg-amber-400/10 px-1.5 py-0.5 rounded ml-0 mt-0.5 inline-block">
                            сериал
                          </span>
                        )}
                      </div>
                      <ScoreBadge score={r.score} />
                    </div>

                    <CriteriaBars rating={r} />

                    {r.review && (
                      <p className="text-sm text-slate-400 mt-2 line-clamp-3">
                        {stripMarkers(r.review)}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2 mt-2">
                      <span className="text-xs text-slate-600">
                        {r.created_at
                          ? new Date(r.created_at).toLocaleDateString("ru-RU", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })
                          : ""}
                      </span>
                      <button
                        onClick={() => setOpenReview(r)}
                        className="text-xs text-amber-400 hover:text-amber-300 transition-colors shrink-0"
                      >
                        Открыть рецензию →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
