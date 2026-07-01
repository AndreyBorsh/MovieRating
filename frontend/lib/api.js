const API = "/api";

const authHeader = (token) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token}`,
});

// =========================
// AUTH
// =========================
export async function register(username, email, password) {
  const res = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Ошибка регистрации");
  return data;
}

export async function verifyEmail(email, code) {
  const res = await fetch(`${API}/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Ошибка подтверждения");
  return data;
}

export async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Ошибка входа");
  return data; // { token, user_id, username }
}

// =========================
// MOVIES
// =========================
export async function getMovies() {
  const res = await fetch(`${API}/movies`);
  return res.json();
}

export async function getMovie(id) {
  const res = await fetch(`${API}/movies/${id}`);
  if (!res.ok) throw new Error("Фильм не найден");
  return res.json();
}

export async function getMovieScore(id) {
  const res = await fetch(`${API}/movies/${id}/score`);
  return res.json();
}

export async function getReviews(id, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API}/movies/${id}/reviews`, { headers });
  return res.json();
}

export async function getMyRating(token, tmdbId) {
  const res = await fetch(`${API}/movies/${tmdbId}/my-rating`, {
    headers: authHeader(token),
  });
  if (res.status === 401) return null;
  const data = await res.json();
  return data;
}

// =========================
// TV SHOWS
// =========================
export async function getTvShows() {
  const res = await fetch(`${API}/tv`);
  return res.json();
}

export async function getTv(id) {
  const res = await fetch(`${API}/tv/${id}`);
  if (!res.ok) throw new Error("Сериал не найден");
  return res.json();
}

export async function getTvReviews(id, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API}/tv/${id}/reviews`, { headers });
  return res.json();
}

export async function getMyTvRatings(token, tmdbId) {
  const res = await fetch(`${API}/tv/${tmdbId}/my-ratings`, {
    headers: authHeader(token),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// =========================
// RATINGS
// =========================
function authError(status, fallback) {
  const msg = status === 401 ? "Сессия истекла. Войдите в аккаунт заново." : fallback;
  const err = new Error(msg);
  err.status = status;
  return err;
}

export async function sendRating(token, payload) {
  const res = await fetch(`${API}/ratings`, {
    method: "POST",
    headers: authHeader(token),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw authError(res.status, data.detail || "Ошибка отправки");
  return data;
}

export async function updateRating(token, payload) {
  const res = await fetch(`${API}/ratings`, {
    method: "PUT",
    headers: authHeader(token),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw authError(res.status, data.detail || "Ошибка обновления");
  return data;
}

export async function deleteMyMovieRating(token, tmdbId) {
  const res = await fetch(`${API}/movies/${tmdbId}/my-rating`, {
    method: "DELETE",
    headers: authHeader(token),
  });
  return res.ok;
}

export async function deleteRating(token, ratingId) {
  const res = await fetch(`${API}/ratings/${ratingId}`, {
    method: "DELETE",
    headers: authHeader(token),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw authError(res.status, data.detail || "Ошибка удаления");
  return data;
}

export async function reactToReview(token, ratingId, emoji) {
  const res = await fetch(`${API}/ratings/${ratingId}/react`, {
    method: "POST",
    headers: authHeader(token),
    body: JSON.stringify({ emoji }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Ошибка реакции");
  return data;
}

export async function postComment(token, ratingId, text) {
  const res = await fetch(`${API}/ratings/${ratingId}/comments`, {
    method: "POST",
    headers: authHeader(token),
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Ошибка комментария");
  return data;
}

// =========================
// RECENT & PROFILE
// =========================
export async function getRecent() {
  const res = await fetch(`${API}/recent`);
  return res.json();
}

export async function getProfile(userId) {
  const res = await fetch(`${API}/profile/${userId}`);
  if (!res.ok) throw new Error("Профиль не найден");
  return res.json();
}

// =========================
// SIMILAR
// =========================
export async function getSimilarMovies(id) {
  const res = await fetch(`${API}/movies/${id}/similar`);
  return res.json();
}

export async function getSimilarTv(id) {
  const res = await fetch(`${API}/tv/${id}/similar`);
  return res.json();
}

// =========================
// DETAILS (cast, images, country)
// =========================
export async function getMovieDetails(id) {
  const res = await fetch(`${API}/movies/${id}/details`);
  return res.json();
}

export async function getTvDetails(id) {
  const res = await fetch(`${API}/tv/${id}/details`);
  return res.json();
}

// =========================
// SEARCH
// =========================
export async function searchMovies(query, type = "movie") {
  const res = await fetch(
    `${API}/search?query=${encodeURIComponent(query)}&media_type=${type}`
  );
  return res.json();
}

// Combined movie + TV search
export async function searchMulti(query) {
  const res = await fetch(`${API}/search/multi?query=${encodeURIComponent(query)}`);
  return res.json();
}

// =========================
// PRIVATE NOTES (owner-only)
// =========================
export async function getNote(token, mediaType, id) {
  const res = await fetch(`${API}/notes/${mediaType}/${id}`, {
    headers: authHeader(token),
  });
  if (!res.ok) return { content: "", updated_at: null };
  return res.json();
}

export async function saveNote(token, mediaType, id, content) {
  const res = await fetch(`${API}/notes/${mediaType}/${id}`, {
    method: "PUT",
    headers: authHeader(token),
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("Не удалось сохранить заметку");
  return res.json();
}

export async function getMyNotes(token) {
  const res = await fetch(`${API}/notes`, { headers: authHeader(token) });
  if (!res.ok) return [];
  return res.json();
}

// =========================
// NOTIFICATIONS
// =========================
export async function getNotifications(token) {
  const res = await fetch(`${API}/notifications`, { headers: authHeader(token) });
  if (!res.ok) return { unread: 0, items: [], recipient_id: null };
  return res.json();
}

export async function markNotificationsRead(token) {
  const res = await fetch(`${API}/notifications/read`, {
    method: "POST",
    headers: authHeader(token),
  });
  return res.ok;
}

// =========================
// GIVEAWAYS
// =========================
export async function getGiveaways(token) {
  const res = await fetch(`${API}/giveaways`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return { is_admin: false, eligible: false, items: [], min_words: 30, my_potential_tickets: 0 };
  return res.json();
}

export async function enterGiveaway(token, id) {
  const res = await fetch(`${API}/giveaways/${id}/enter`, { method: "POST", headers: authHeader(token) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Не удалось участвовать");
  return data;
}

export async function createGiveaway(token, payload) {
  const res = await fetch(`${API}/admin/giveaways`, {
    method: "POST", headers: authHeader(token), body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Ошибка создания");
  return data;
}

export async function drawGiveaway(token, id) {
  const res = await fetch(`${API}/admin/giveaways/${id}/draw`, { method: "POST", headers: authHeader(token) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Ошибка розыгрыша");
  return data;
}

export async function deleteGiveaway(token, id) {
  const res = await fetch(`${API}/admin/giveaways/${id}`, { method: "DELETE", headers: authHeader(token) });
  return res.ok;
}

export async function getGiveawayEntries(token, id) {
  const res = await fetch(`${API}/admin/giveaways/${id}/entries`, { headers: authHeader(token) });
  if (!res.ok) return [];
  return res.json();
}

export async function recheckGiveaway(token, id) {
  const res = await fetch(`${API}/admin/giveaways/${id}/recheck`, { method: "POST", headers: authHeader(token) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Ошибка перепроверки");
  return data;
}

export async function getMyGiveawayReviews(token) {
  const res = await fetch(`${API}/giveaways/my-reviews`, { headers: authHeader(token) });
  if (!res.ok) return { open: false, items: [] };
  return res.json();
}

export async function requestManualReview(token, ratingId) {
  const res = await fetch(`${API}/giveaways/request-manual/${ratingId}`, { method: "POST", headers: authHeader(token) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Не удалось отправить запрос");
  return data;
}

export async function getManualReviews(token) {
  const res = await fetch(`${API}/admin/manual-reviews`, { headers: authHeader(token) });
  if (!res.ok) return [];
  return res.json();
}

export async function decideManualReview(token, ratingId, decision, comment) {
  const res = await fetch(`${API}/admin/manual-reviews/${ratingId}`, {
    method: "POST", headers: authHeader(token), body: JSON.stringify({ decision, comment }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Ошибка");
  return data;
}
