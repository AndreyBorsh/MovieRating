"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getProfile, getMyNotes, updateProfile, requestEmailChange, confirmEmailChange } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import ReviewText, { stripMarkers } from "@/app/components/ReviewText";
import ScoreBadge, { scoreColor } from "@/app/components/Score";
import { img } from "@/lib/base";

const POSTER = (p) => img("w185", p);

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

function seasonLabel(from, to) {
  if (from == null) return null;
  if (from === to) return `${from}-й сезон`;
  return `Сезоны ${from}–${to}`;
}

// Competition-style ranks: equal scores (by displayed value) share a place ("5-6")
function rankLabels(sorted) {
  const key = (r) => r.score.toFixed(1);
  const labels = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && key(sorted[j + 1]) === key(sorted[i])) j++;
    const label = i === j ? `${i + 1}` : `${i + 1}-${j + 1}`;
    for (let k = i; k <= j; k++) labels[k] = label;
    i = j + 1;
  }
  return labels;
}

function Stat({ icon, value, label, color = "text-stone-900" }) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 border"
      style={{ background: "#efe9df", borderColor: "rgba(0,0,0,0.08)" }}
    >
      <span className="text-lg leading-none">{icon}</span>
      <div className="leading-tight">
        <div className={`text-base font-bold ${color}`}>{value}</div>
        <div className="text-[10px] text-stone-500">{label}</div>
      </div>
    </div>
  );
}

function ProfileStats({ ratings, onOpen }) {
  if (!ratings.length) return null;

  const scores = ratings.map((r) => r.score);
  const sorted = [...ratings].sort((a, b) => b.score - a.score);
  const allLabels = rankLabels(sorted);
  const top = sorted.slice(0, 10);
  const topLabels = allLabels.slice(0, 10);
  const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
  const max = Math.max(...scores);
  const min = Math.min(...scores);

  const movieScores = ratings.filter((r) => r.media_type !== "tv").map((r) => r.score);
  const tvScores = ratings.filter((r) => r.media_type === "tv").map((r) => r.score);
  const avgOf = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null);
  const movieAvg = avgOf(movieScores);
  const tvAvg = avgOf(tvScores);

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold tracking-tight text-stone-900">Статистика</h2>

      <div className="flex flex-col md:flex-row gap-3 md:items-stretch">
        {/* Indicators — fixed, compact width */}
        <div className="grid grid-cols-2 gap-2 content-start shrink-0 md:w-[320px]">
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

        {/* Top by score — larger podium taking the rest */}
        <div
          className="rounded-xl px-4 py-3 border md:flex-1 flex flex-col"
          style={{ background: "#efe9df", borderColor: "rgba(0,0,0,0.08)" }}
        >
          <div className="text-xs text-stone-600 mb-3 text-center">🏆 Топ по оценке</div>
          <div className="flex-1 flex flex-col sm:flex-row gap-3 sm:gap-5">
            <div className="flex items-end justify-center shrink-0">
              <Podium top={top} labels={topLabels} onOpen={onOpen} />
            </div>

            {top.length > 3 && (
              <div
                className="flex-1 min-w-0 flex flex-col justify-center gap-1.5 border-t pt-3 sm:border-t-0 sm:pt-0 sm:border-l sm:pl-5"
                style={{ borderColor: "rgba(0,0,0,0.08)" }}
              >
                {top.slice(3).map((r, i) => (
                  <button
                    key={i}
                    onClick={() => onOpen(r)}
                    className="flex items-center gap-2 group w-full text-left"
                    title={r.movie_title}
                  >
                    <span className="text-xs text-stone-500 font-semibold w-8 text-right shrink-0">{topLabels[i + 3]}</span>
                    {POSTER(r.poster) ? (
                      <img src={POSTER(r.poster)} alt={r.movie_title}
                        className="w-7 h-10 rounded object-cover shrink-0 group-hover:brightness-110 transition" />
                    ) : (
                      <div className="w-7 h-10 rounded bg-stone-200 flex items-center justify-center text-xs shrink-0">
                        {r.media_type === "tv" ? "📺" : "🎬"}
                      </div>
                    )}
                    <span className="flex-1 min-w-0 text-sm text-stone-700 truncate group-hover:text-amber-600 transition-colors">
                      {r.movie_title}
                    </span>
                    <span className={`text-xs font-display font-medium shrink-0 ${scoreColor(r.score)}`}>{r.score.toFixed(1)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Podium({ top, labels, onOpen }) {
  const MEDAL = ["🥇", "🥈", "🥉"];
  const ACCENT = ["#f5c518", "#cbd5e1", "#c2855a"];
  const BASE_H = ["h-12", "h-8", "h-5"];
  const POSTER_CLS = ["w-24 h-36", "w-20 h-28", "w-20 h-28"];

  // visual left→right order: 2nd, 1st, 3rd
  const order = [1, 0, 2];

  const Spot = ({ rank }) => {
    const r = top[rank];
    if (!r) return <div className="w-20" />;
    return (
      <div className="w-20 sm:w-24 flex flex-col items-center justify-end">
        <div className="text-2xl mb-1">{MEDAL[rank]}</div>
        <button onClick={() => onOpen(r)} className="group" title={`${r.movie_title} · ${r.score.toFixed(1)}`}>
          {POSTER(r.poster) ? (
            <img
              src={POSTER(r.poster)}
              alt={r.movie_title}
              className={`${POSTER_CLS[rank]} rounded-lg object-cover group-hover:brightness-110 transition`}
              style={{ border: `2px solid ${ACCENT[rank]}` }}
            />
          ) : (
            <div
              className={`${POSTER_CLS[rank]} rounded-lg bg-stone-200 flex items-center justify-center text-2xl`}
              style={{ border: `2px solid ${ACCENT[rank]}` }}
            >
              {r.media_type === "tv" ? "📺" : "🎬"}
            </div>
          )}
        </button>
        <div className={`text-sm font-display font-medium mt-1 ${scoreColor(r.score)}`}>{r.score.toFixed(1)}</div>
        <div
          className={`${BASE_H[rank]} w-full rounded-t-md mt-1 flex items-start justify-center`}
          style={{ background: `linear-gradient(180deg, ${ACCENT[rank]}40, ${ACCENT[rank]}10)`, borderTop: `2px solid ${ACCENT[rank]}` }}
        >
          <span className="text-[10px] font-bold mt-0.5 whitespace-nowrap" style={{ color: ACCENT[rank] }}>
            {labels[rank]}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-3">
      {order.map((rank) => <Spot key={rank} rank={rank} />)}
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
            <span className="text-xs text-stone-400 w-20 shrink-0">{label}</span>
            <div className="flex-1 h-1 bg-stone-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${k === "overall" ? "bg-amber-400" : "bg-stone-400"}`}
                style={{ width: `${((val - 1) / 9) * 100}%` }}
              />
            </div>
            <span className="text-xs text-stone-600 w-4 text-right">{val}</span>
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
      style={{ background: "rgba(30,22,12,0.55)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border overflow-y-auto max-h-[90vh] p-5 space-y-4"
        style={{ background: "#fbf9f4", borderColor: "rgba(0,0,0,0.06)", boxShadow: "0 24px 60px rgba(40,30,15,0.28)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3 min-w-0">
            {POSTER(rating.poster) ? (
              <img src={POSTER(rating.poster)} alt={rating.movie_title} className="w-14 h-20 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-14 h-20 rounded-lg bg-stone-200 flex items-center justify-center text-2xl shrink-0">
                {isTV ? "📺" : "🎬"}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-base font-bold tracking-tight text-stone-900 leading-tight">{rating.movie_title}</div>
              <div className="flex flex-wrap gap-1 mt-1">
                <span className={`text-xs px-1.5 py-0.5 rounded ${isTV ? "text-amber-600 bg-amber-400/10" : "text-sky-600 bg-sky-400/10"}`}>
                  {isTV ? "сериал" : "фильм"}
                </span>
                {isTV && seasonLabel(rating.season_from, rating.season_to) && (
                  <span className="text-xs text-amber-600 bg-amber-400/10 px-1.5 py-0.5 rounded">📺 {seasonLabel(rating.season_from, rating.season_to)}</span>
                )}
              </div>
              <div className="mt-1"><ScoreBadge score={rating.score} /></div>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-800 transition text-lg leading-none shrink-0">✕</button>
        </div>

        <CriteriaBars rating={rating} />

        {rating.review ? (
          <div className="border-t pt-3" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
            <ReviewText text={rating.review} />
          </div>
        ) : (
          <div className="border-t pt-3 text-sm text-stone-400 italic" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
            Без текстовой рецензии
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t pt-3" style={{ borderColor: "rgba(0,0,0,0.08)" }}>
          <span className="text-xs text-stone-400">
            {rating.created_at
              ? new Date(rating.created_at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
              : ""}
          </span>
          <Link href={href} className="text-xs text-amber-600 hover:text-amber-500 transition shrink-0">
            Открыть страницу {isTV ? "сериала" : "фильма"} →
          </Link>
        </div>
      </div>
    </div>
  );
}

function EditProfileModal({ profile, token, onClose, onSaved }) {
  const [bio, setBio] = useState(profile.bio || "");
  const [avatar, setAvatar] = useState(profile.avatar || null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErr("Выберите изображение"); return; }
    setErr("");
    const reader = new FileReader();
    reader.onload = () => {
      const im = document.createElement("img");
      im.onload = () => {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        const min = Math.min(im.width, im.height);      // center-crop to square
        const sx = (im.width - min) / 2, sy = (im.height - min) / 2;
        ctx.drawImage(im, sx, sy, min, min, 0, 0, size, size);
        setAvatar(canvas.toDataURL("image/jpeg", 0.85));
      };
      im.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const save = async () => {
    setBusy(true); setErr("");
    try {
      await updateProfile(token, { bio: bio.trim(), avatar });
      onSaved();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(30,22,12,0.55)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border overflow-y-auto max-h-[90vh] p-5 space-y-4"
        style={{ background: "#fbf9f4", borderColor: "rgba(0,0,0,0.06)", boxShadow: "0 24px 60px rgba(40,30,15,0.28)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold tracking-tight text-stone-900">Редактировать профиль</h3>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-800 text-lg leading-none" aria-label="Закрыть">✕</button>
        </div>

        <div className="flex items-center gap-4">
          {avatar ? (
            <img src={avatar} alt="" className="w-20 h-20 rounded-full object-cover border border-amber-400/30" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-2xl text-amber-600">
              {profile.username.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 text-stone-700 hover:border-amber-400/50 hover:text-amber-600 transition cursor-pointer w-fit">
              Загрузить фото
              <input type="file" accept="image/*" onChange={onFile} className="hidden" />
            </label>
            {avatar && (
              <button onClick={() => setAvatar(null)} className="text-xs text-rose-500 hover:text-rose-400 w-fit">Убрать</button>
            )}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1.5">О себе</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="Расскажите о себе, любимые жанры, фильмы…"
            className="w-full rounded-lg px-3 py-2 text-sm text-stone-900 outline-none focus:ring-1 focus:ring-amber-400/50 resize-none"
            style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.12)" }}
          />
          <div className="text-[10px] text-stone-400 text-right mt-0.5">{bio.length}/1000</div>
        </div>

        {err && <p className="text-xs text-rose-500">{err}</p>}

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg text-stone-600 hover:text-stone-800 transition">Отмена</button>
          <button
            onClick={save}
            disabled={busy}
            className="text-sm px-4 py-2 rounded-lg font-semibold text-stone-900 bg-gradient-to-br from-amber-300 to-amber-500 hover:brightness-105 disabled:opacity-50 transition"
          >
            {busy ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangeEmailModal({ token, onClose, onSaved }) {
  const [step, setStep] = useState("email"); // "email" | "code"
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const sendCode = async () => {
    if (!email.trim()) return;
    setBusy(true); setErr("");
    try {
      await requestEmailChange(token, email.trim());
      setStep("code");
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (code.trim().length < 4) return;
    setBusy(true); setErr("");
    try {
      await confirmEmailChange(token, code.trim());
      setDone(true);
      setTimeout(() => onSaved(), 1300);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: "rgba(30,22,12,0.55)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border overflow-y-auto max-h-[90vh] p-5 space-y-4"
        style={{ background: "#fbf9f4", borderColor: "rgba(0,0,0,0.06)", boxShadow: "0 24px 60px rgba(40,30,15,0.28)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold tracking-tight text-stone-900">Сменить почту</h3>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-800 text-lg leading-none" aria-label="Закрыть">✕</button>
        </div>

        {done ? (
          <p className="text-emerald-600 font-semibold py-4 text-center">✓ Почта изменена</p>
        ) : step === "email" ? (
          <>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">Новая почта</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="new@example.com"
                className="w-full rounded-lg px-3 py-2 text-sm text-stone-900 outline-none focus:ring-1 focus:ring-amber-400/50"
                style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.12)" }}
              />
              <p className="text-xs text-stone-500 mt-1.5">Отправим код подтверждения на новый адрес.</p>
            </div>
            {err && <p className="text-xs text-rose-500">{err}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg text-stone-600 hover:text-stone-800 transition">Отмена</button>
              <button onClick={sendCode} disabled={busy || !email.trim()}
                className="text-sm px-4 py-2 rounded-lg font-semibold text-stone-900 bg-gradient-to-br from-amber-300 to-amber-500 hover:brightness-105 disabled:opacity-50 transition">
                {busy ? "Отправка…" : "Отправить код"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-stone-600">
              Код отправлен на <span className="text-amber-600">{email}</span>. Введите его:
            </p>
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="______"
              className="w-full rounded-lg px-3 py-2 text-center text-xl tracking-[0.4em] text-stone-900 outline-none focus:ring-1 focus:ring-amber-400/50"
              style={{ background: "#fff", border: "1px solid rgba(0,0,0,0.12)" }}
            />
            {err && <p className="text-xs text-rose-500">{err}</p>}
            <div className="flex gap-2 justify-between items-center">
              <button onClick={() => { setStep("email"); setErr(""); setCode(""); }} className="text-sm text-stone-500 hover:text-stone-800 transition">← Назад</button>
              <button onClick={confirm} disabled={busy || code.trim().length < 4}
                className="text-sm px-4 py-2 rounded-lg font-semibold text-stone-900 bg-gradient-to-br from-amber-300 to-amber-500 hover:brightness-105 disabled:opacity-50 transition">
                {busy ? "Проверка…" : "Подтвердить"}
              </button>
            </div>
          </>
        )}
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
  const [editOpen, setEditOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    getProfile(id)
      .then(setProfile)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const reloadProfile = () => getProfile(id).then(setProfile).catch(console.error);

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
        <div className="text-stone-500 text-sm">Загрузка...</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-16 text-stone-500">
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

  const movieCount = profile.ratings.filter((r) => r.media_type !== "tv").length;
  const tvCount    = profile.ratings.filter((r) => r.media_type === "tv").length;

  return (
    <div className="space-y-8">
      {openReview && <ReviewModal rating={openReview} onClose={() => setOpenReview(null)} />}

      {editOpen && (
        <EditProfileModal
          profile={profile}
          token={token}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); reloadProfile(); }}
        />
      )}

      {emailOpen && (
        <ChangeEmailModal
          token={token}
          onClose={() => setEmailOpen(false)}
          onSaved={() => setEmailOpen(false)}
        />
      )}

      {/* Profile header */}
      <div
        className="rounded-xl p-6 border flex items-start gap-6"
        style={{ background: "rgba(255,255,255,0.72)", borderColor: "rgba(0,0,0,0.08)" }}
      >
        {profile.avatar ? (
          <img
            src={profile.avatar}
            alt={profile.username}
            className="w-16 h-16 rounded-full object-cover shrink-0 border border-amber-400/30"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-amber-400/10 border border-amber-400/30 flex items-center justify-center font-display text-2xl font-medium text-amber-600 shrink-0">
            {profile.username.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-stone-900">
              {profile.username}
              {isMe && (
                <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-400/10 px-2 py-0.5 rounded-full">
                  вы
                </span>
              )}
            </h1>
            {isMe && (
              <div className="shrink-0 flex flex-wrap gap-2 justify-end">
                <button
                  onClick={() => setEditOpen(true)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 text-stone-700 hover:border-amber-400/50 hover:text-amber-600 transition"
                >
                  Редактировать
                </button>
                <button
                  onClick={() => setEmailOpen(true)}
                  className="text-xs px-3 py-1.5 rounded-lg border border-stone-300 text-stone-700 hover:border-amber-400/50 hover:text-amber-600 transition"
                >
                  Сменить почту
                </button>
              </div>
            )}
          </div>
          {joined && (
            <div className="text-sm text-stone-500 mt-0.5">
              На платформе с {joined}
            </div>
          )}
          <div className="flex flex-wrap gap-4 mt-2 text-sm text-stone-600">
            {movieCount > 0 && (
              <span>
                <span className="text-stone-900 font-semibold">{movieCount}</span>{" "}
                {movieCount === 1 ? "фильм" : movieCount < 5 ? "фильма" : "фильмов"}
              </span>
            )}
            {tvCount > 0 && (
              <span>
                <span className="text-stone-900 font-semibold">{tvCount}</span>{" "}
                {tvCount === 1 ? "сериал" : tvCount < 5 ? "сериала" : "сериалов"}
              </span>
            )}
          </div>
          {profile.bio && (
            <p className="text-sm text-stone-700 mt-3 whitespace-pre-line leading-relaxed">
              {profile.bio}
            </p>
          )}
        </div>
      </div>

      {/* Statistics */}
      <ProfileStats ratings={profile.ratings} onOpen={setOpenReview} />

      {/* My private notes (own profile only) */}
      {isMe && notes.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xl font-bold tracking-tight text-stone-900 flex items-center gap-2">
            📝 Мои заметки
            <span className="text-xs font-normal text-stone-400">только вы их видите</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {notes.map((n) => {
              const href = n.media_type === "tv" ? `/tv/${n.media_id}` : `/movies/${n.media_id}`;
              return (
                <Link
                  key={`${n.media_type}-${n.media_id}`}
                  href={href}
                  className="flex gap-3 rounded-xl p-3 border hover:border-amber-400/40 transition-colors min-w-0"
                  style={{ background: "rgba(255,255,255,0.72)", borderColor: "rgba(0,0,0,0.08)" }}
                >
                  {POSTER(n.poster) ? (
                    <img src={POSTER(n.poster)} alt={n.title || ""} className="w-12 h-16 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-16 rounded-lg bg-stone-200 flex items-center justify-center text-stone-400 shrink-0">
                      {n.media_type === "tv" ? "📺" : "🎬"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-stone-900 line-clamp-1">
                        {n.title || (n.media_type === "tv" ? "Сериал" : "Фильм")}
                      </p>
                      <span className={`text-[10px] px-1 py-0.5 rounded shrink-0 ${n.media_type === "tv" ? "text-amber-600 bg-amber-400/10" : "text-sky-600 bg-sky-400/10"}`}>
                        {n.media_type === "tv" ? "сериал" : "фильм"}
                      </span>
                    </div>
                    <p className="text-xs text-stone-600 mt-1 line-clamp-2 whitespace-pre-wrap">{n.content}</p>
                    {n.updated_at && (
                      <p className="text-[10px] text-stone-400 mt-1">
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
          className="rounded-xl p-8 border text-center text-stone-500 text-sm"
          style={{ background: "rgba(255,255,255,0.72)", borderColor: "rgba(0,0,0,0.08)" }}
        >
          {isMe
            ? "Вы ещё не оценивали фильмы и сериалы. Найдите что-нибудь в поиске!"
            : "Пользователь пока не оставил ни одной рецензии."}
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight text-stone-900">Рецензии</h2>
          {profile.ratings.map((r, idx) => {
            const isTV = r.media_type === "tv";
            const href = isTV ? `/tv/${r.movie_id}` : `/movies/${r.movie_id}`;
            return (
              <div
                key={idx}
                className="rounded-xl border overflow-hidden"
                style={{ background: "rgba(255,255,255,0.72)", borderColor: "rgba(0,0,0,0.08)" }}
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
                      <div className="w-16 h-24 rounded-lg bg-stone-200 flex items-center justify-center text-stone-400 text-2xl">
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
                          className="text-base font-bold tracking-tight text-stone-900 hover:text-amber-600 transition-colors line-clamp-1"
                        >
                          {r.movie_title}
                        </Link>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${isTV ? "text-amber-600 bg-amber-400/10" : "text-sky-600 bg-sky-400/10"}`}>
                            {isTV ? "сериал" : "фильм"}
                          </span>
                          {isTV && seasonLabel(r.season_from, r.season_to) && (
                            <span className="text-xs text-amber-600 bg-amber-400/10 px-1.5 py-0.5 rounded">
                              📺 {seasonLabel(r.season_from, r.season_to)}
                            </span>
                          )}
                        </div>
                      </div>
                      <ScoreBadge score={r.score} />
                    </div>

                    <CriteriaBars rating={r} />

                    {r.review && (
                      <p className="text-sm text-stone-600 mt-2 line-clamp-3">
                        {stripMarkers(r.review)}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2 mt-2">
                      <span className="text-xs text-stone-400">
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
                        className="text-xs text-amber-600 hover:text-amber-500 transition-colors shrink-0"
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
