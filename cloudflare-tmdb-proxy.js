// ─────────────────────────────────────────────────────────────
//  Cloudflare Worker: прокси для сервисов, заблокированных на сервере (РФ).
//
//  Проксирует по пути:
//    /3/...     →  https://api.themoviedb.org/3/...       (TMDB API)
//    /t/p/...   →  https://image.tmdb.org/t/p/...         (TMDB картинки)
//    /groq/...  →  https://api.groq.com/...               (Groq LLM API)
//
//  Для Groq прокидываются метод, тело и заголовки Authorization / Content-Type,
//  поэтому запрос уходит с edge Cloudflare (не из РФ) и не ловит 403 Forbidden.
//
//  Как обновить (бесплатно):
//    1. https://dash.cloudflare.com → Workers & Pages → открыть свой воркер tmdb.
//    2. "Edit code", вставить ВЕСЬ этот файл, "Deploy".
//
//  В проекте:
//    TMDB_BASE=https://tmdb.ТВОЙ-САБДОМЕН.workers.dev/3
//    TMDB_IMAGE_BASE=https://tmdb.ТВОЙ-САБДОМЕН.workers.dev
//    LLM_API_URL=https://tmdb.ТВОЙ-САБДОМЕН.workers.dev/groq/openai/v1/chat/completions
// ─────────────────────────────────────────────────────────────
export default {
  async fetch(request) {
    const url = new URL(request.url);

    let origin, path;
    if (url.pathname.startsWith("/groq/")) {
      origin = "https://api.groq.com";
      path = url.pathname.slice("/groq".length); // strip the /groq prefix, keep the rest
    } else if (url.pathname.startsWith("/t/")) {
      origin = "https://image.tmdb.org";
      path = url.pathname;
    } else {
      origin = "https://api.themoviedb.org";
      path = url.pathname;
    }

    const isBodyless = request.method === "GET" || request.method === "HEAD";
    const headers = {};
    const auth = request.headers.get("Authorization");
    const ctype = request.headers.get("Content-Type");
    if (auth) headers["Authorization"] = auth;
    if (ctype) headers["Content-Type"] = ctype;
    if (!auth) headers["Accept"] = "application/json,image/*";

    const resp = await fetch(origin + path + url.search, {
      method: request.method,
      headers,
      body: isBodyless ? undefined : await request.text(),
    });

    const outHeaders = new Headers(resp.headers);
    outHeaders.set("Access-Control-Allow-Origin", "*");
    return new Response(resp.body, { status: resp.status, headers: outHeaders });
  },
};
