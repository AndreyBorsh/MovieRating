// Web App Manifest — makes WAW installable (PWA) and is the basis for the
// Trusted Web Activity wrapper published to Google Play. Served at
// {basePath}/manifest.webmanifest; Next injects <link rel="manifest"> for us.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "/waw-movie";

export default function manifest() {
  return {
    name: "What's Andrew Watching",
    short_name: "WAW",
    description: "Оценки и рецензии на фильмы и сериалы, розыгрыши билетов в кино.",
    id: `${BASE}/`,
    start_url: `${BASE}/`,
    scope: `${BASE}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#070b16",
    theme_color: "#0b1226",
    lang: "ru",
    dir: "ltr",
    categories: ["entertainment", "lifestyle"],
    icons: [
      { src: `${BASE}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${BASE}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${BASE}/icons/maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
