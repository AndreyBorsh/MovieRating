// Where TMDB images are fetched from. Defaults to a Cloudflare Worker proxy so the
// server needs no VPN (image.tmdb.org is blocked in some regions). The worker
// forwards /t/p/... to TMDB. Override with TMDB_IMAGE_BASE=https://image.tmdb.org.
const IMAGE_BASE = process.env.TMDB_IMAGE_BASE || "https://tmdb.andreykuzn19.workers.dev";

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
