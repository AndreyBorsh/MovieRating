// Sub-path the app is served under (e.g. "/waw-movie"). MUST match `basePath`
// in next.config.mjs. The value is inlined into the client bundle at build time,
// so to deploy under a different prefix set NEXT_PUBLIC_BASE_PATH before building.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/waw-movie";

// TMDB images are served DIRECTLY from the Cloudflare Worker (edge-cached),
// not proxied through our Node server — proxying ~50 posters per page overwhelmed
// the small self-hosted server (504s). The worker is fast and not blocked.
// Returns an absolute URL, e.g. https://tmdb.<sub>.workers.dev/t/p/w342/<path>.
const IMAGE_BASE =
  process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE || "https://tmdb.andreykuzn19.workers.dev";

export const img = (size, path) =>
  path ? `${IMAGE_BASE}/t/p/${size}${path}` : null;
