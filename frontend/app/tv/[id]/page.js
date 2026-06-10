"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import {
  getTv, getTvReviews, getMyTvRating,
  sendRating, updateRating, reactToReview, postComment, getSimilarTv, getTvDetails,
} from "@/lib/api";
import ReviewText from "@/app/components/ReviewText";
import ReviewEditor from "@/app/components/ReviewEditor";
import MediaExtras from "@/app/components/MediaExtras";

const POSTER_LG = (p) => p && `/api/tmdb-image/w500${p}`;
const POSTER_SM = (p) => p && `/api/tmdb-image/w185${p}`;

// TV-specific criteria (different weights from movies)
const TV_CRITERIA = [
  { key: "overall",    label: "Общее впечатление", weight: "30%", main: true,
    tip: "Субъективное впечатление от просмотра. Насколько вам понравился сериал? Это главный и самый честный критерий." },
  { key: "story",      label: "Сценарий и сюжет",  weight: "20%",
    tip: "Качество истории, диалогов, арок персонажей по сезонам. Логичность развития и неожиданные повороты." },
  { key: "characters", label: "Персонажи",          weight: "20%",
    tip: "Насколько хорошо написаны персонажи: глубина, мотивация, последовательность характера. Для обычных сериалов — развитие по сезонам. Для антологий — убедительность героев внутри каждой истории. Это критерий сценариста, а не актёра." },
  { key: "acting",     label: "Исполнение",             weight: "10%",
    tip: "Насколько хорошо актёры воплощают персонажей: мимика, жесты, эмоции — видно даже в дубляже. Для мультсериалов — выразительность анимации персонажей. Это отдельный критерий от написания: актёр может вытянуть слабого персонажа или загубить сильного." },
  { key: "visuals",    label: "Визуальный стиль",   weight: "10%",
    tip: "Операторская работа, декорации, костюмы, спецэффекты. Общий визуальный уровень производства." },
  { key: "pacing",     label: "Темп и динамика",    weight: "10%",
    tip: "Ритм повествования, отсутствие воды и затянутых сцен. Для обычных сериалов — хочется ли смотреть следующую серию. Для антологий — внутренний темп каждой истории." },
];

const TV_FORMULA_TEXT =
  "30%·Общее + 20%·Сценарий + 20%·Персонажи + 10%·Исполнение + 10%·Визуал + 10%·Темп";

function calcTVScore(vals) {
  const { overall, story, characters, acting, visuals, pacing } = vals;
  const score =
    overall    * 0.30 +
    story      * 0.20 +
    characters * 0.20 +
    acting     * 0.10 +
    visuals    * 0.10 +
    pacing     * 0.10;
  return Math.max(1, Math.min(10, score)).toFixed(2);
}

function ScoreColor({ score }) {
  const n = parseFloat(score);
  if (n >= 7.5) return "text-emerald-400";
  if (n >= 5.5) return "text-amber-400";
  return "text-red-400";
}

function ScoreBadge({ score, size = "lg" }) {
  const cls = ScoreColor({ score });
  return (
    <span className={`font-bold ${cls} ${size === "lg" ? "text-4xl" : "text-base"}`}>
      {score > 0 ? (typeof score === "number" ? score.toFixed(1) : score) : "—"}
    </span>
  );
}

function Tooltip({ tip, children }) {
  return (
    <div className="relative group/tip">
      {children}
      {tip && (
        <div
          className="absolute left-0 bottom-full mb-2 w-60 p-2.5 rounded-lg text-xs text-slate-300 leading-relaxed z-30 hidden group-hover/tip:block pointer-events-none shadow-xl"
          style={{ background: "#0c1220", border: "1px solid #1e2d45" }}
        >
          {tip}
        </div>
      )}
    </div>
  );
}

function CriteriaBar({ label, value, weight, main, tip }) {
  const pct = ((value - 1) / 9) * 100;
  const barColor = main ? "bg-amber-400" : "bg-slate-500";
  return (
    <div className="flex items-center gap-2 text-sm">
      <Tooltip tip={tip}>
        <div className={`w-24 sm:w-36 shrink-0 text-xs sm:text-sm cursor-help ${main ? "text-amber-400 font-medium" : "text-slate-400"}`}>
          {label}
        </div>
      </Tooltip>
      <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <div className="w-6 text-right text-slate-300 font-semibold">{value}</div>
      <div className="w-8 text-right text-slate-600 text-xs">{weight}</div>
    </div>
  );
}

function Slider({ criterion, value, onChange }) {
  return (
    <div>
      <div className="flex justify-between items-center mb-1.5">
        <Tooltip tip={criterion.tip}>
          <span className={`text-sm cursor-help ${criterion.main ? "text-amber-400 font-semibold" : "text-slate-300"}`}>
            {criterion.label}
            {criterion.main && <span className="ml-1 text-xs text-slate-500">(главный)</span>}
          </span>
        </Tooltip>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{criterion.weight}</span>
          <span className={`text-lg font-bold w-8 text-right ${criterion.main ? "text-amber-400" : "text-slate-100"}`}>
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
      <div className="flex justify-between text-xs text-slate-600 mt-0.5">
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
    <div className="flex flex-wrap gap-1.5 pt-2 border-t" style={{ borderColor: "#1e2d45" }}>
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
                ? "bg-amber-400/20 border border-amber-400/50 text-amber-300"
                : "border text-slate-400 hover:border-slate-500 hover:text-slate-200 disabled:opacity-40 disabled:cursor-default"
              }`}
            style={{ borderColor: active ? undefined : "#1e2d45" }}
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

function Comments({ ratingId, initialComments, token, currentUserId }) {
  const [comments, setComments] = useState(initialComments || []);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

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
    <div className="pt-2 border-t space-y-2" style={{ borderColor: "#1e2d45" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
      >
        {open ? "Скрыть комментарии ▲" : `Комментарии${comments.length > 0 ? ` (${comments.length})` : ""} ▼`}
      </button>
      {open && (
        <div className="space-y-2">
          {comments.length === 0 && <p className="text-xs text-slate-600">Комментариев пока нет</p>}
          {comments.map((c, i) => (
            <div key={c.id ?? i} className="text-xs overflow-hidden">
              <span className="text-amber-400 font-medium mr-2">{c.username}</span>
              <span className="text-slate-400 break-all">{c.text}</span>
            </div>
          ))}
          {token && (
            <div className="flex gap-2 pt-1">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submit()}
                maxLength={500}
                placeholder="Написать комментарий..."
                className="flex-1 rounded-lg px-3 py-1.5 text-xs text-slate-100 outline-none focus:ring-1 focus:ring-amber-400/50"
                style={{ background: "#0c1220", border: "1px solid #1e2d45" }}
              />
              <button
                onClick={submit}
                disabled={sending || !text.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 disabled:opacity-40 transition"
              >
                →
              </button>
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          {!token && <p className="text-xs text-slate-600">Войдите чтобы оставить комментарий</p>}
        </div>
      )}
    </div>
  );
}

const DEFAULT_FORM = {
  overall: 7, story: 7, characters: 7, acting: 7, visuals: 7, pacing: 7,
};

export default function TvPage() {
  const { id: tvId } = useParams();
  const { token, user, ready } = useAuth();

  const [show,     setShow]     = useState(null);
  const [reviews,  setReviews]  = useState([]);
  const [myRating, setMyRating] = useState(null);
  const [form,     setForm]     = useState(DEFAULT_FORM);
  const [reviewText, setReviewText] = useState("");
  const [loading,  setLoading]  = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState(false);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [editing,  setEditing]  = useState(false);
  const [similar,  setSimilar]  = useState([]);
  const [details,  setDetails]  = useState(null);

  useEffect(() => {
    if (!tvId || !ready) return;
    loadAll();
  }, [tvId, token, ready]);

  useEffect(() => {
    if (!tvId) return;
    getSimilarTv(tvId).then((data) => setSimilar(Array.isArray(data) ? data : []));
    getTvDetails(tvId).then((data) => setDetails(data && typeof data === "object" ? data : null));
  }, [tvId]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [showData, reviewsData] = await Promise.all([
        getTv(tvId),
        getTvReviews(tvId, token),
      ]);
      setShow(showData);
      setReviews(Array.isArray(reviewsData) ? reviewsData : []);
      if (token) {
        const mine = await getMyTvRating(token, tvId);
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
      overall:    myRating.overall,
      story:      myRating.story,
      characters: myRating.characters,
      acting:     myRating.acting,
      visuals:    myRating.visuals,
      pacing:     myRating.pacing,
    });
    setReviewText(myRating.review || "");
    setError("");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setError("");
  };

  const submit = async () => {
    setError("");
    setSubmitting(true);
    try {
      const payload = {
        tmdb_id: parseInt(tvId),
        media_type: "tv",
        ...form,
        review: reviewText.trim() || null,
      };
      if (editing) {
        await updateRating(token, payload);
        setEditing(false);
      } else {
        await sendRating(token, payload);
        setSuccess(true);
      }
      await loadAll();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const preview = calcTVScore(form);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-slate-500 text-sm">Загрузка...</div>
      </div>
    );
  }

  if (!show) {
    return <div className="text-center py-16 text-slate-500">Сериал не найден</div>;
  }

  const communityScore = show.score || 0;
  const ratingCount = show.count || 0;

  return (
    <div className="space-y-8">
      {/* ── Show header ── */}
      <div className="flex flex-col sm:flex-row gap-5">
        {POSTER_LG(show.poster) ? (
          <img
            src={POSTER_LG(show.poster)}
            alt={show.title}
            className="w-32 sm:w-40 rounded-xl object-cover shrink-0 shadow-lg self-start"
          />
        ) : (
          <div
            className="w-32 sm:w-40 h-48 sm:h-56 rounded-xl shrink-0 flex items-center justify-center text-slate-600 text-5xl"
            style={{ background: "#141d2e" }}
          >
            📺
          </div>
        )}

        <div className="flex-1 min-w-0 py-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
              📺 Сериал
            </span>
            {show.seasons && (
              <span className="text-xs text-slate-500">
                {show.seasons} {show.seasons === 1 ? "сезон" : show.seasons < 5 ? "сезона" : "сезонов"}
              </span>
            )}
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-slate-100">
            {show.title}
            {show.year && (
              <span className="ml-2 text-base font-normal text-slate-500">
                ({show.year})
              </span>
            )}
          </h1>

          {show.overview && (
            <div className="mt-2">
              <p className={`text-sm text-slate-400 leading-relaxed ${overviewExpanded ? "" : "line-clamp-4"}`}>
                {show.overview}
              </p>
              <button
                onClick={() => setOverviewExpanded((v) => !v)}
                className="text-xs text-amber-400 hover:text-amber-300 mt-1 transition-colors"
              >
                {overviewExpanded ? "Скрыть ▲" : "Читать далее ▼"}
              </button>
            </div>
          )}

          <div className="flex items-end gap-3 mt-4">
            <ScoreBadge score={communityScore} size="lg" />
            <span className="text-slate-500 text-sm mb-1">
              средняя оценка · {ratingCount}{" "}
              {ratingCount === 1 ? "рецензия" : ratingCount < 5 ? "рецензии" : "рецензий"}
            </span>
          </div>
        </div>
      </div>

      <MediaExtras details={details} mediaType="tv" variant="meta" />

      <div className="grid lg:grid-cols-[1fr_380px] gap-8">
        {/* ── Left: reviews ── */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-slate-100">
            Рецензии ({reviews.length})
          </h2>

          {reviews.length === 0 && (
            <div
              className="rounded-xl p-6 text-center text-slate-500 text-sm border"
              style={{ background: "#141d2e", borderColor: "#1e2d45" }}
            >
              Пока нет рецензий. Будьте первым!
            </div>
          )}

          {reviews.map((r, idx) => (
            <div
              key={idx}
              className="rounded-xl p-4 border space-y-3"
              style={{ background: "#141d2e", borderColor: "#1e2d45" }}
            >
              <div className="flex items-center justify-between">
                <Link
                  href={`/profile/${r.user_id}`}
                  className="text-sm font-semibold text-amber-400 hover:underline"
                >
                  {r.username}
                </Link>
                <ScoreBadge score={r.score} size="sm" />
              </div>

              <div className="space-y-1.5">
                {TV_CRITERIA.map((c) => (
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
                <div className="border-t pt-3" style={{ borderColor: "#1e2d45" }}>
                  <ReviewText text={r.review} />
                </div>
              )}

              <div className="text-xs text-slate-600">
                {r.created_at
                  ? new Date(r.created_at).toLocaleDateString("ru-RU", {
                      day: "numeric", month: "long", year: "numeric",
                    })
                  : ""}
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
              />
            </div>
          ))}
        </div>

        {/* ── Right: rating form ── */}
        <div>
          {!token ? (
            <div
              className="rounded-xl p-6 border text-center"
              style={{ background: "#141d2e", borderColor: "#1e2d45" }}
            >
              <p className="text-sm text-slate-400 mb-4">
                Войдите, чтобы оставить оценку
              </p>
              <Link
                href="/login"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 transition"
              >
                Войти
              </Link>
            </div>
          ) : myRating && !editing ? (
            <div
              className="rounded-xl p-5 border space-y-3"
              style={{ background: "#141d2e", borderColor: "#1e2d45" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-300">Ваша оценка</span>
                <ScoreBadge score={myRating.score} size="sm" />
              </div>
              <div className="space-y-1.5">
                {TV_CRITERIA.map((c) => (
                  <CriteriaBar key={c.key} label={c.label} value={myRating[c.key]}
                    weight={c.weight} main={c.main} tip={c.tip} />
                ))}
              </div>
              {myRating.review && (
                <div className="border-t pt-3" style={{ borderColor: "#1e2d45" }}>
                  <ReviewText text={myRating.review} muted />
                </div>
              )}
              <button
                onClick={startEditing}
                className="w-full py-2 rounded-lg text-sm font-medium text-slate-300 border border-slate-700 hover:border-amber-400/50 hover:text-amber-400 transition"
              >
                ✏️ Редактировать оценку
              </button>
            </div>
          ) : success && !editing ? (
            <div
              className="rounded-xl p-6 border text-center"
              style={{ background: "#141d2e", borderColor: "#1e2d45" }}
            >
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm text-slate-300 font-medium">Оценка сохранена!</p>
              <p className="text-xs text-slate-500 mt-1">Ваша рецензия добавлена</p>
            </div>
          ) : (editing || (!myRating && !success)) && (
            <div
              className="rounded-xl p-5 border space-y-5"
              style={{ background: "#141d2e", borderColor: "#1e2d45" }}
            >
              <h3 className="text-base font-semibold text-slate-100">
                {editing ? "Редактировать оценку" : "Оценить сериал"}
              </h3>

              <div className="space-y-4">
                {TV_CRITERIA.map((c) => (
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
                style={{ background: "#0c1220", borderColor: "#1e2d45" }}
              >
                <span className="text-sm text-slate-400">Итоговая оценка</span>
                <span className={`text-2xl font-bold ${ScoreColor({ score: parseFloat(preview) })}`}>
                  {preview}
                </span>
              </div>
              <p className="text-[10px] text-slate-700 text-center leading-relaxed -mt-3">
                {TV_FORMULA_TEXT}
              </p>

              {/* Review editor */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Рецензия <span className="text-slate-600">(необязательно)</span>
                </label>
                <ReviewEditor
                  value={reviewText}
                  onChange={setReviewText}
                  placeholder="Напишите подробный отзыв о сериале..."
                />
              </div>

              {error && (
                <div className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <button
                onClick={submit}
                disabled={submitting}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-slate-900 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 transition"
              >
                {submitting ? "Сохраняем..." : editing ? "Сохранить изменения" : "Опубликовать рецензию"}
              </button>
              {editing && (
                <button
                  onClick={cancelEditing}
                  className="w-full py-2 rounded-lg text-sm text-slate-500 hover:text-slate-300 transition"
                >
                  Отмена
                </button>
              )}
            </div>
          )}

          {details && (
            <div className="mt-6">
              <MediaExtras details={details} mediaType="tv" variant="media" />
            </div>
          )}
        </div>
      </div>

      {/* Similar TV Shows */}
      {similar.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">Похожие сериалы</h2>
          <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            {similar.map((item) => (
              <Link
                key={item.id}
                href={`/tv/${item.id}`}
                className="shrink-0 group"
              >
                <div className="w-28 rounded-lg overflow-hidden border border-transparent group-hover:border-amber-400/40 transition-all">
                  {item.poster ? (
                    <img
                      src={`/api/tmdb-image/w185${item.poster}`}
                      alt={item.title}
                      className="w-28 h-40 object-cover"
                    />
                  ) : (
                    <div className="w-28 h-40 bg-slate-800 flex items-center justify-center text-3xl text-slate-600">
                      📺
                    </div>
                  )}
                  <div className="px-1.5 py-1.5" style={{ background: "#141d2e" }}>
                    <p className="text-xs text-slate-300 leading-tight line-clamp-2 group-hover:text-amber-400 transition-colors">
                      {item.title}
                    </p>
                    {item.year && (
                      <p className="text-[10px] text-slate-600 mt-0.5">{item.year}</p>
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
