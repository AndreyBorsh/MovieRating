export async function GET(request, context) {
  const { path } = await context.params;
  const tmdbUrl = `https://image.tmdb.org/t/p/${path.join("/")}`;

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
