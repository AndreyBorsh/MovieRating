// Sub-path the app is served under (e.g. "/waw-movie"). MUST match `basePath`
// in next.config.mjs. The value is inlined into the client bundle at build time,
// so to deploy under a different prefix set NEXT_PUBLIC_BASE_PATH before building.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "/waw-movie";

// TMDB image proxy URL that respects the base path. `<img>` and next/image do
// NOT auto-prepend basePath, so build image src through this helper.
export const img = (size, path) =>
  path ? `${BASE_PATH}/api/tmdb-image/${size}${path}` : null;
