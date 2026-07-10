// ─────────────────────────────────────────────────────────────
//  Cloudflare Worker: прокси к TMDB для серверов, где TMDB заблокирован.
//
//  Проксирует и API, и картинки, по пути:
//    /3/...    →  https://api.themoviedb.org/3/...
//    /t/p/...  →  https://image.tmdb.org/t/p/...
//
//  Как задеплоить (бесплатно):
//    1. Зайти на https://dash.cloudflare.com → Workers & Pages → Create → Worker.
//    2. Дать имя (например tmdb), Deploy.
//    3. Открыть "Edit code", вставить ВЕСЬ этот файл, снова Deploy.
//    4. Скопировать URL воркера, вида  https://tmdb.ТВОЙ-САБДОМЕН.workers.dev
//
//  Потом в .env проекта прописать (см. .env.example):
//    TMDB_BASE=https://tmdb.ТВОЙ-САБДОМЕН.workers.dev/3
//    TMDB_IMAGE_BASE=https://tmdb.ТВОЙ-САБДОМЕН.workers.dev
// ─────────────────────────────────────────────────────────────
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = url.pathname.startsWith("/t/")
      ? "https://image.tmdb.org"
      : "https://api.themoviedb.org";

    const resp = await fetch(origin + url.pathname + url.search, {
      method: request.method,
      headers: { Accept: "application/json,image/*" },
    });

    const headers = new Headers(resp.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(resp.body, { status: resp.status, headers });
  },
};
