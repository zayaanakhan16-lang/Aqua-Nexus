/** @type {import('next').NextConfig} */
const backendOrigin = (process.env.AQUANEXUS_BACKEND_ORIGIN ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    // Linting runs as its own CI step, not during `next build`.
    ignoreDuringBuilds: true,
  },
  // Proxy API calls to the FastAPI backend so the browser only ever talks to
  // the same origin. This avoids CORS and keeps credentials server-side.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
