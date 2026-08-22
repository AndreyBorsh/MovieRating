const SITE = "https://makuku.ddns.net";

export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // keep private/interactive-only areas out of the index
      disallow: ["/waw-movie/admin", "/waw-movie/profile"],
    },
    sitemap: `${SITE}/waw-movie/sitemap.xml`,
  };
}
