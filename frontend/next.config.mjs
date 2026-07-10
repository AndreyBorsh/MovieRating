/** @type {import('next').NextConfig} */
const nextConfig = {
  // Slim production image: `.next/standalone` ships its own minimal node server.
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
