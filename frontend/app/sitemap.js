import { serverGet } from "@/lib/server-api";

const SITE = "https://makuku.ddns.net";
const BASE = `${SITE}/waw-movie`;

// Sitemap of static pages + every rated film/series. Served at
// {basePath}/sitemap.xml — submit that URL in Google Search Console / Яндекс
// Вебмастер (crawlers look for /sitemap.xml at the domain root, which the
// sub-path app can't own).
export default async function sitemap() {
  const now = new Date();
  const staticPages = [
    { url: `${BASE}`, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE}/search`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE}/giveaways`, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE}/register`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/login`, changeFrequency: "monthly", priority: 0.3 },
  ].map((p) => ({ ...p, lastModified: now }));

  const [movies, tv] = await Promise.all([
    serverGet("/movies"),
    serverGet("/tv"),
  ]);

  const filmPages = [];
  for (const m of Array.isArray(movies) ? movies : []) {
    const id = m.id ?? m.tmdb_id;
    if (id) filmPages.push({ url: `${BASE}/movies/${id}`, lastModified: now, changeFrequency: "weekly", priority: 0.6 });
  }
  for (const t of Array.isArray(tv) ? tv : []) {
    const id = t.id ?? t.tmdb_id;
    if (id) filmPages.push({ url: `${BASE}/tv/${id}`, lastModified: now, changeFrequency: "weekly", priority: 0.6 });
  }

  return [...staticPages, ...filmPages];
}
