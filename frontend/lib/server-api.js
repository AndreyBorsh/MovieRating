// Server-only fetch to the FastAPI backend, used by server components and
// generateMetadata so film/TV pages are rendered (and indexed) with real
// content. In the container the backend is reachable at BACKEND_URL; requests
// hit the raw API (no /waw-movie prefix). Always degrades to null on failure so
// pages still render (the client then fetches as usual).
const BACKEND = process.env.BACKEND_URL || "http://backend:8000";

export async function serverGet(path) {
  try {
    const res = await fetch(`${BACKEND}${path}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
