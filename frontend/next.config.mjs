/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: "https://movierrating-production-5025.up.railway.app/:path*",
      },
    ];
  },
};

export default nextConfig;
