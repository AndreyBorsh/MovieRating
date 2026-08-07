"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { getMovie, getReviews, getMyRating, sendRating, updateRating, reactToReview, postComment, getSimilarMovies, getMovieDetails, deleteMyMovieRating } from "@/lib/api";
import ReviewText from "@/app/components/ReviewText";
import ReviewEditor from "@/app/components/ReviewEditor";
import MediaExtras from "@/app/components/MediaExtras";
import PrivateNote from "@/app/components/PrivateNote";
import ScoreBadge, { scoreColor } from "@/app/components/Score";
import ExpandableText from "@/app/components/ExpandableText";
import { img } from "@/lib/base";

const POSTER_LG = (p) => img("w500", p);
const POSTER_SM = (p) => img("w185", p);
const BACKDROP_HERO = (p) => img("w1280", p);

const CRITERIA = [
  { key: "overall",   label: "Общее впечатление", weight: "35%", main: true,
    tip: "Субъективное впечатление от просмотра. Насколько вам понравился фильм? Это главный и самый честный критерий." },
  { key: "story",     label: "Сценарий",           weight: "20%",
    tip: "История, диалоги, структура повествования. Для мюзиклов — тексты и драматургия. Для анимации — проработка персонажей." },
  { key: "direction", label: "Режиссура",           weight: "15%",
    tip: "Темп, монтаж, выбор ракурсов. Насколько точно режиссёр воплотил идею и собрал всё в единое целое?" },
  { key: "acting",    label: "Актёрская игра",      weight: "15%",
    tip: "Убедительность и глубина актёрских работ. Для анимации — качество озвучки и выразительность персонажей." },
  { key: "visuals",   label: "Визуальный стиль",    weight: "10%",
    tip: "Операторская работа, цветовое решение, дизайн кадра. Для анимации — качество рисовки и арт-дирекшн." },
  { key: "music",     label: "Звук и атмосфера",    weight: "5%",
    tip: "Саундтрек, звуковой дизайн и создаваемая атмосфера. Особенно важен для мюзиклов, хорроров и эпических фильмов." },
];

const FORMULA_TEXT = "35%·Общее + 20%·Сценарий + 15%·Режиссура + 15%·Актёры + 10%·Визуал + 5%·Звук";

function calcScore(vals) {
  const { overall, story, direction, acting, visuals, music } = vals;
  const score =
    overall   * 0.35 +
    story     * 0.20 +
    direction * 0.15 +
    acting    * 0.15 +
    visuals   * 0.10 +
    music     * 0.05;
  return Math.max(1, Math.min(10, score)).toFixed(2);
}

function Tooltip({ tip, children }) {
  return (
    <div className="relative group/tip">
      {children}
      {tip && (
        <div className="absolute left-0 bottom-full mb-2 w-60 p-2.5 rounded-lg text-xs text-stone-200 leading-relaxed z-30 hidden group-hover/tip:block pointer-events-none shadow-xl"
             style={{ background: "#141b31", border: "1px solid rgba(255,255,255,0.10)" }}>
          {tip}
        </div>
      )}
    </div>
  );
}

function CriteriaBar({ label, value, weight, main, tip }) {
  const pct = ((value - 1) / 9) * 100;
  const barColor = main ? "bg-red-500" : "bg-stone-500";
  return (
    <div className="flex items-center gap-2 text-sm">
      <Tooltip tip={tip}>
        <div className={`w-24 sm:w-36 shrink-0 text-xs sm:text-sm cursor-help ${main ? "text-red-400 font-medium" : "text-stone-300"}`}>
          {label}
        </div>
      </Tooltip>
      <div className="flex-1 h-1.5 bg-stone-700 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-6 text-right text-stone-200 font-semibold">{value}</div>
      <div className="w-8 text-right text-stone-500 text-xs">{weight}</div>
    </div>
  );
}

function Slider({ criterion, value, onChange }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <Tooltip tip={criterion.tip}>
          <span className={`text-sm cursor-help ${criterion.main ? "text-red-400 font-semibold" : "text-stone-200"}`}>
            {criterion.label}
            {criterion.main && <span className="ml-1 text-xs text-stone-400">(главный)</span>}
          </span>
        </Tooltip>
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-400">{criterion.weight}</span>
          <span
            className={`text-lg font-bold w-8 text-right ${
              criterion.main ? "text-red-400" : "text-stone-50"
            }`}
          >
            {value}
          </span>
        </div>
      </div>
      <input
        type="range"
        min="1"
        max="10"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="flex justify-between text-xs text-stone-500 mt-0.5">
        <span>1</span>
        <span>10</span>
      </div>
    </div>
  );
}

const EMOJIS = ["👍", "❤️", "🔥", "😮", "🤔", "👎", "💩", "🤡"];

function Reactions({ ratingId, reactions, myReaction, token, onUpdate }) {
  const [pending, setPending] = useState(false);

  const handle = async (emoji) => {
    if (!token || pending) return;
    setPending(true);
    try {
      const res = await reactToReview(token, ratingId, emoji);
      onUpdate(ratingId, emoji, myReaction, res.my_reaction);
    } catch (_) {}
    finally { setPending(false); }
  };

  return (
    <div className="flex flex-wrap gap-1.5 pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.10)" }}>
      {EMOJIS.map((emoji) => {
        const count = reactions[emoji] || 0;
        const active = myReaction === emoji;
        return (
          <button
            key={emoji}
            onClick={() => handle(emoji)}
            disabled={!token || pending}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-sm transition-all
              ${active
                ? "bg-red-500/20 border border-red-500/50 text-red-600"
                : "border text-stone-300 hover:border-stone-500 hover:text-stone-100 disabled:opacity-40 disabled:cursor-default"
              }`}
            style={{ borderColor: active ? undefined : "rgba(255,255,255,0.10)" }}
            title={!token ? "Войдите чтобы реагировать" : undefined}
          >
            <span>{emoji}</span>
            {count > 0 && <span className="text-xs font-medium">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Comments({ ratingId, initialComments, token, currentUserId, reviewAuthorId }) {
  const [comments, setComments] = useState(initialComments || []);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  const canComment = !!token;

  const submit = async () => {
    if (!text.trim()) return;
    setSending(true);
    setError("");
    try {
      const c = await postComment(token, ratingId, text.trim());
      setComments((prev) => [...prev, { ...c, username: "Вы", user_id: currentUserId }]);
      setText("");
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="pt-2 border-t space-y-2" style={{ borderColor: "rgba(255,255,255,0.10)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-stone-400 hover:text-stone-200 transition-colors"
      >
        {open ? "Скрыть комментарии ▲" : `Комментарии${comments.length > 0 ? ` (${comments.length})` : ""} ▼`}
      </button>

      {open && (
        <div className="space-y-2">
          {comments.length === 0 && (
            <p className="text-xs text-stone-500">Комментариев пока нет</p>
          )}
          {comments.map((c, i) => (
            <div key={c.id ?? i} className="text-xs overflow-hidden">
              <span className="text-red-400 font-medium mr-2">{c.username}</span>
              <span className="text-stone-300 break-all">{c.text}</span>
            </div>
          ))}

          {canComment && (
            <div className="flex gap-2 pt-1">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submit()}
                maxLength={500}
                placeholder="Написать комментарий..."
                className="flex-1 rounded-lg px-3 py-1.5 text-xs text-stone-50 outline-none focus:ring-1 focus:ring-red-500/50"
                style={{ background: "#141b31", border: "1px solid rgba(255,255,255,0.10)" }}
              />
              <button
                onClick={submit}
                disabled={sending || !text.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-50 bg-red-500 hover:bg-red-400 disabled:opacity-40 transition"
              >
                →
              </button>
            </div>
          )}
          {error && <p className="text-xs text-rose-500">{error}</p>}
          {!token && (
            <p className="text-xs text-stone-500">Войдите чтобы оставить комментарий</p>
          )}
        </div>
      )}
    </div>
  );
}

const DEFAULT_FORM = { overall: 7, story: 7, direction: 7, acting: 7, visuals: 7, music: 7 };

export default function MoviePage() {
  const { id: movieId } = useParams();
  const { token, user, ready, logout } = useAuth();

  const [movie, setMovie] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [myRating, setMyRating] = useState(null); // existing rating or null
  const [form, setForm] = useState(DEFAULT_FORM);
  const [reviewText, setReviewText] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [editing, setEditing] = useState(false);
  const [similar, setSimilar] = useState([]);
  const [details, setDetails] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [highlightUser, setHighlightUser] = useState(null);

  useEffect(() => {
    if (!movieId || !ready) return;
    loadAll();
  }, [movieId, token, ready]);

  useEffect(() => {
    if (!movieId) return;
    getSimilarMovies(movieId).then((data) => setSimilar(Array.isArray(data) ? data : []));
    getMovieDetails(movieId).then((data) => setDetails(data && typeof data === "object" ? data : null));
  }, [movieId]);

  // Deep-link to a specific review (#review-<userId>): scroll + highlight
  useEffect(() => {
    if (!reviews.length) return;
    const m = window.location.hash.match(/^#review-(\d+)$/);
    if (!m) return;
    const uid = parseInt(m[1]);
    const el = document.getElementById(`review-${uid}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightUser(uid);
    const t = setTimeout(() => setHighlightUser(null), 2800);
    return () => clearTimeout(t);
  }, [reviews]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [movieData, reviewsData] = await Promise.all([
        getMovie(movieId),
        getReviews(movieId, token),
      ]);
      setMovie(movieData);
      setReviews(Array.isArray(reviewsData) ? reviewsData : []);

      if (token) {
        const mine = await getMyRating(token, movieId);
        setMyRating(mine);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const setVal = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const handleReactionUpdate = (ratingId, emoji, prevEmoji, newEmoji) => {
    setReviews((prev) => prev.map((r) => {
      if (r.rating_id !== ratingId) return r;
      const reactions = { ...r.reactions };
      if (prevEmoji) reactions[prevEmoji] = Math.max(0, (reactions[prevEmoji] || 1) - 1);
      if (newEmoji) reactions[newEmoji] = (reactions[newEmoji] || 0) + 1;
      return { ...r, reactions, my_reaction: newEmoji };
    }));
  };

  const startEditing = () => {
    if (!myRating) return;
    setForm({
      overall:   myRating.overall,
      story:     myRating.story,
      direction: myRating.direction,
      acting:    myRating.acting,
      visuals:   myRating.visuals,
      music:     myRating.music,
    });
    setReviewText(myRating.review || "");
    setError("");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setError("");
  };

  const removeRating = async () => {
    if (!confirm("Удалить вашу рецензию на этот фильм?")) return;
    try {
      await deleteMyMovieRating(token, parseInt(movieId));
      setMyRating(null);
      setEditing(false);
      setSuccess(false);
      setForm(DEFAULT_FORM);
      setReviewText("");
      await loadAll();
    } catch (e) {
      setError(e.message || "Не удалось удалить");
    }
  };

  const submit = async () => {
    setError("");
    setSubmitting(true);
    try {
      const payload = { tmdb_id: parseInt(movieId), ...form, review: reviewText.trim() || null };
      if (editing) {
        await updateRating(token, payload);
        setEditing(false);
      } else {
        await sendRating(token, payload);
        setSuccess(true);
      }
      await loadAll();
    } catch (e) {
      if (e.status === 401) {
        setSessionExpired(true);
        logout();
      } else {
        setError(e.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const preview = calcScore(form);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-stone-400 text-sm">Загрузка...</div>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="text-center py-16 text-stone-400">Фильм не найден</div>
    );
  }

  const communityScore = movie.score || 0;
  const ratingCount = movie.count || 0;

  const heroBackdrop = details?.backdrops?.[0];

  return (
    <div className="space-y-8">
      {/* ── Movie header ── */}
      <div className="relative rounded-2xl overflow-hidden border" style={{ borderColor: "rgba(255,255,255,0.10)" }}>
        {heroBackdrop && (
          <>
            <img
              src={BACKDROP_HERO(heroBackdrop)}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0" style={{ background: "rgba(255,255,255,0.14)" }} />
          </>
        )}
        <div className="relative z-10 flex flex-col sm:flex-row gap-5 p-4 sm:p-7">
          {POSTER_LG(movie.poster) ? (
            <img
              src={POSTER_LG(movie.poster)}
              alt={movie.title}
              className="w-32 sm:w-40 rounded-xl object-cover shrink-0 shadow-lg self-start"
            />
          ) : (
            <div
              className="w-32 sm:w-40 h-48 sm:h-56 rounded-xl shrink-0 flex items-center justify-center text-stone-500 text-5xl"
              style={{ background: "rgba(22,28,52,0.72)" }}
            >
              🎬
            </div>
          )}

          <div
            className="flex-1 min-w-0 rounded-2xl p-4 sm:p-5"
            style={{ background: "rgba(16,20,40,0.9)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
          >
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-stone-50">
              {movie.title}
              {movie.year && (
                <span className="ml-2 text-base font-medium text-stone-400">
                  ({movie.year})
                </span>
              )}
            </h1>
            {details?.original_title && details.original_title !== movie.title && (
              <p className="text-sm text-stone-500 mt-0.5">{details.original_title}</p>
            )}

            {movie.overview && (
              <ExpandableText text={movie.overview} className="text-sm text-stone-300 leading-relaxed" />
            )}

            <div className="flex items-center gap-3 mt-4">
              <div
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-2 flex items-center justify-center shrink-0"
                style={{ borderColor: "rgba(210,154,60,0.5)", background: "rgba(14,18,36,0.92)", boxShadow: "0 4px 16px rgba(0,0,0,0.1)" }}
              >
                <ScoreBadge score={communityScore} size="lg" />
              </div>
              <span className="text-stone-300 text-sm">
                средняя оценка · {ratingCount}{" "}
                {ratingCount === 1 ? "рецензия" : ratingCount < 5 ? "рецензии" : "рецензий"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <MediaExtras details={details} mediaType="movie" variant="meta" />

      <div className="grid lg:grid-cols-[1fr_380px] gap-8">
        {/* ── Left: reviews ── */}
        <div className="space-y-4 order-2 lg:order-1 min-w-0">
          <h2 className="text-lg font-semibold text-stone-50">
            Рецензии ({reviews.length})
          </h2>

          {reviews.length === 0 && (
            <div
              className="rounded-xl p-6 text-center text-stone-400 text-sm border"
              style={{ background: "rgba(22,28,52,0.72)", borderColor: "rgba(255,255,255,0.10)" }}
            >
              Пока нет рецензий. Будьте первым!
            </div>
          )}

          {reviews.map((r, idx) => (
            <div
              key={idx}
              id={`review-${r.user_id}`}
              className={`rounded-xl p-4 border space-y-3 scroll-mt-20 transition-all ${
                highlightUser === r.user_id ? "ring-2 ring-red-500" : ""
              }`}
              style={{ background: "rgba(22,28,52,0.72)", borderColor: "rgba(255,255,255,0.10)" }}
            >
              <div className="flex items-center justify-between">
                <Link
                  href={`/profile/${r.user_id}`}
                  className="text-sm font-semibold text-red-400 hover:underline"
                >
                  {r.username}
                </Link>
                <ScoreBadge score={r.score} size="sm" />
              </div>

              <div className="space-y-1.5">
                {CRITERIA.map((c) => (
                  <CriteriaBar
                    key={c.key}
                    label={c.label}
                    value={r[c.key]}
                    weight={c.weight}
                    main={c.main}
                    tip={c.tip}
                  />
                ))}
              </div>

              {r.review && (
                <div className="border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.10)" }}>
                  <ReviewText text={r.review} />
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="text-xs text-stone-500">
                  {r.created_at
                    ? new Date(r.created_at).toLocaleDateString("ru-RU", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : ""}
                </div>
              </div>

              <Reactions
                ratingId={r.rating_id}
                reactions={r.reactions || {}}
                myReaction={r.my_reaction}
                token={token}
                onUpdate={handleReactionUpdate}
              />
              <Comments
                ratingId={r.rating_id}
                initialComments={r.comments || []}
                token={token}
                currentUserId={user?.user_id}
                reviewAuthorId={r.user_id}
              />
            </div>
          ))}
        </div>

        {/* ── Right: rating form ── */}
        <div className="order-1 lg:order-2 min-w-0 space-y-3">
          {!token ? (
            <div
              className="rounded-xl p-6 border text-center"
              style={{ background: "rgba(22,28,52,0.72)", borderColor: "rgba(255,255,255,0.10)" }}
            >
              {sessionExpired && (
                <p className="text-sm text-red-400 mb-3">
                  Сессия истекла. Войдите заново, чтобы оценить.
                </p>
              )}
              <p className="text-sm text-stone-300 mb-4">
                Войдите, чтобы оставить оценку
              </p>
              <Link
                href="/login"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-stone-50 bg-red-500 hover:bg-red-400 transition"
              >
                Войти
              </Link>
            </div>
          ) : myRating && !editing ? (
            <div
              className="rounded-xl p-5 border space-y-3"
              style={{ background: "rgba(22,28,52,0.72)", borderColor: "rgba(255,255,255,0.10)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-stone-200">Ваша оценка</span>
                <ScoreBadge score={myRating.score} size="sm" />
              </div>
              <div className="space-y-1.5">
                {CRITERIA.map((c) => (
                  <CriteriaBar key={c.key} label={c.label} value={myRating[c.key]}
                    weight={c.weight} main={c.main} tip={c.tip} />
                ))}
              </div>
              {myRating.review && (
                <div className="border-t pt-3" style={{ borderColor: "rgba(255,255,255,0.10)" }}>
                  <ReviewText text={myRating.review} muted />
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={startEditing}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-stone-200 border border-stone-600 hover:border-red-500/50 hover:text-red-400 transition"
                >
                  ✏️ Редактировать
                </button>
                <button
                  onClick={removeRating}
                  className="px-3 py-2 rounded-lg text-sm text-stone-400 border border-stone-600 hover:border-red-400/50 hover:text-rose-500 transition"
                  aria-label="Удалить оценку"
                >
                  🗑
                </button>
              </div>
            </div>
          ) : success && !editing ? (
            <div
              className="rounded-xl p-6 border text-center"
              style={{ background: "rgba(22,28,52,0.72)", borderColor: "rgba(255,255,255,0.10)" }}
            >
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm text-stone-200 font-medium">Оценка сохранена!</p>
              <p className="text-xs text-stone-400 mt-1">Ваша рецензия добавлена</p>
            </div>
          ) : (editing || (!myRating && !success)) && (
            <div
              className="rounded-xl p-5 border space-y-5"
              style={{ background: "rgba(22,28,52,0.72)", borderColor: "rgba(255,255,255,0.10)" }}
            >
              <h3 className="text-base font-semibold text-stone-50">
                {editing ? "Редактировать оценку" : "Оценить фильм"}
              </h3>

              <div className="space-y-4">
                {CRITERIA.map((c) => (
                  <Slider
                    key={c.key}
                    criterion={c}
                    value={form[c.key]}
                    onChange={setVal(c.key)}
                  />
                ))}
              </div>

              {/* Live score */}
              <div
                className="flex items-center justify-between rounded-lg px-4 py-3 border"
                style={{ background: "#141b31", borderColor: "rgba(255,255,255,0.10)" }}
              >
                <span className="text-sm text-stone-300">Итоговая оценка</span>
                <span className={`font-display text-2xl font-medium ${scoreColor(parseFloat(preview))}`}>
                  {preview}
                </span>
              </div>
              <p className="text-[10px] text-stone-200 text-center leading-relaxed -mt-3">
                {FORMULA_TEXT}
              </p>

              {/* Review editor */}
              <div>
                <label className="block text-xs font-medium text-stone-300 mb-1.5">
                  Рецензия{" "}
                  <span className="text-stone-500">(необязательно)</span>
                </label>
                <ReviewEditor
                  value={reviewText}
                  onChange={setReviewText}
                  placeholder="Напишите подробный отзыв о фильме..."
                />
              </div>

              {error && (
                <div className="text-sm text-rose-500 bg-red-400/10 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <button
                onClick={submit}
                disabled={submitting}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-stone-50 bg-red-500 hover:bg-red-400 disabled:opacity-50 transition"
              >
                {submitting ? "Сохраняем..." : editing ? "Сохранить изменения" : "Опубликовать рецензию"}
              </button>
              {editing && (
                <button
                  onClick={cancelEditing}
                  className="w-full py-2 rounded-lg text-sm text-stone-400 hover:text-stone-200 transition"
                >
                  Отмена
                </button>
              )}
            </div>
          )}

          {token && (
            <PrivateNote mediaType="movie" mediaId={parseInt(movieId)} token={token} />
          )}

          {details && (
            <MediaExtras details={details} mediaType="movie" variant="media" />
          )}
        </div>
      </div>

      {/* Similar Movies */}
      {similar.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-stone-50 mb-4">Похожие фильмы</h2>
          <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin scrollbar-thumb-stone-200 scrollbar-track-transparent">
            {similar.map((item) => (
              <Link
                key={item.id}
                href={`/movies/${item.id}`}
                className="shrink-0 group"
              >
                <div className="w-28 rounded-lg overflow-hidden border border-transparent group-hover:border-red-500/40 transition-all">
                  {item.poster ? (
                    <img
                      src={POSTER_SM(item.poster)}
                      alt={item.title}
                      className="w-28 h-40 object-cover"
                    />
                  ) : (
                    <div className="w-28 h-40 bg-stone-700 flex items-center justify-center text-3xl text-stone-500">
                      🎬
                    </div>
                  )}
                  <div className="px-1.5 py-1.5" style={{ background: "rgba(22,28,52,0.72)" }}>
                    <p className="text-xs text-stone-200 leading-tight line-clamp-2 group-hover:text-red-400 transition-colors">
                      {item.title}
                    </p>
                    {item.year && (
                      <p className="text-[10px] text-stone-500 mt-0.5">{item.year}</p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
