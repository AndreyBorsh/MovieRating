// Where TMDB images are fetched from. Override with a proxy (e.g. a Cloudflare
// Worker) when the server can't reach image.tmdb.org directly.
const IMAGE_BASE = process.env.TMDB_IMAGE_BASE || "https://image.tmdb.org";

export async function GET(request, context) {
  const { path } = await context.params;
  const tmdbUrl = `${IMAGE_BASE}/t/p/${path.join("/")}`;

  try {
    const res = await fetch(tmdbUrl);
    if (!res.ok) {
      return new Response(null, { status: res.status });
    }
    const blob = await res.arrayBuffer();
    return new Response(blob, {
      status: 200,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "image/jpeg",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new Response(null, { status: 502 });
  }
}
