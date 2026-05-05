const API = "/backend";

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

export async function getReviews(id) {
  const res = await fetch(`${API}/movies/${id}/reviews`);
  return res.json();
}

export async function getMyRating(token, tmdbId) {
  const res = await fetch(`${API}/movies/${tmdbId}/my-rating`, {
    headers: authHeader(token),
  });
  if (res.status === 401) return null;
  const data = await res.json();
  return data; // null if not rated
}

// =========================
// RATINGS
// =========================
export async function sendRating(token, payload) {
  const res = await fetch(`${API}/ratings`, {
    method: "POST",
    headers: authHeader(token),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Ошибка отправки");
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
// SEARCH
// =========================
export async function searchMovies(query) {
  const res = await fetch(
    `${API}/search?query=${encodeURIComponent(query)}`
  );
  return res.json();
}
