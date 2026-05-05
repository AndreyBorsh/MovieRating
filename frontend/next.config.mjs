/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: "https://movierrating-production-fe4c.up.railway.app/:path*",
      },
    ];
  },
};

export default nextConfig;
