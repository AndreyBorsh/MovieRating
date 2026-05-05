const RAILWAY = "https://movierrating-production-fe4c.up.railway.app";

async function handler(request, context) {
  const { params } = context;
  const pathSegments = (await params).path || [];
  const path = pathSegments.join("/");
  const url = new URL(request.url);

  const forwardHeaders = { "content-type": "application/json" };
  const auth = request.headers.get("authorization");
  if (auth) forwardHeaders["authorization"] = auth;

  const options = { method: request.method, headers: forwardHeaders };

  if (!["GET", "HEAD"].includes(request.method)) {
    const body = await request.text();
    if (body) options.body = body;
  }

  try {
    const res = await fetch(`${RAILWAY}/${path}${url.search}`, options);
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ detail: "Backend unavailable" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }
}

export { handler as GET, handler as POST, handler as PUT, handler as DELETE, handler as PATCH };
