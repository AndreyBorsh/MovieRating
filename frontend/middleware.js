import { NextResponse } from "next/server";

// The site moved off Vercel to a self-hosted server. On Vercel (which sets the
// VERCEL env var automatically) show a full-screen "moved" notice for every
// path. Self-hosted deployments don't set VERCEL, so this is a no-op there.
const NEW_URL = "https://makuku.ddns.net/waw-movie";

const MOVED_HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Сайт переехал — What's Andrew Watching</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f5f2ec; color: #2a2018; padding: 24px;
  }
  .card { max-width: 660px; text-align: center; }
  .brand { font-weight: 800; letter-spacing: -0.02em; color: #d29a3c; font-size: 20px; margin-bottom: 32px; }
  h1 { font-size: clamp(34px, 7vw, 60px); font-weight: 800; letter-spacing: -0.03em; line-height: 1.03; margin-bottom: 20px; }
  p { font-size: 18px; line-height: 1.5; color: #6b5d4a; margin-bottom: 36px; }
  a.btn {
    display: inline-block; background: linear-gradient(135deg, #e9b657, #d29a3c);
    color: #2a2018; font-weight: 700; font-size: 18px; text-decoration: none;
    padding: 16px 30px; border-radius: 999px; box-shadow: 0 12px 34px rgba(210, 154, 60, .38);
    transition: filter .15s ease; word-break: break-word;
  }
  a.btn:hover { filter: brightness(1.06); }
</style>
</head>
<body>
  <div class="card">
    <div class="brand">What's Andrew Watching</div>
    <h1>Сайт переехал 🚚</h1>
    <p>Мы переехали на новый адрес. Эта версия больше не обновляется — заходи сюда:</p>
    <a class="btn" href="${NEW_URL}">Перейти на makuku.ddns.net/waw-movie →</a>
  </div>
</body>
</html>`;

export function middleware() {
  if (process.env.VERCEL) {
    return new NextResponse(MOVED_HTML, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  return NextResponse.next();
}
