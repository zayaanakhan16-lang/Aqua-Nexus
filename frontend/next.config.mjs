/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    // Linting runs as its own CI step, not during `next build`.
    ignoreDuringBuilds: true,
  },
  // API calls are proxied to the FastAPI backend by the catch-all route handler
  // at `src/app/api/v1/[...path]/route.ts`, which reads AQUANEXUS_BACKEND_ORIGIN
  // server-side (default http://localhost:8000). A route handler is used rather
  // than a `rewrites()` entry so that an unreachable backend returns a
  // structured 503 JSON error instead of a bare `500 Internal Server Error`
  // text body. This keeps the browser on a single origin and credentials
  // server-side; the origin is never inlined into the client bundle.
};

export default nextConfig;
