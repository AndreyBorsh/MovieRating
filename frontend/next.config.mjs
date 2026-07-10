/** @type {import('next').NextConfig} */
const nextConfig = {
  // Slim production image: `.next/standalone` ships its own minimal node server.
  output: "standalone",
  // Served under a sub-path (e.g. https://makuku.ddns.net/waw-movie). Must match
  // BASE_PATH in lib/base.js; inlined at build time.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "/waw-movie",
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
