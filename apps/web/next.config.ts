import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const base = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, "");
    if (!base) return [];
    return [{ source: "/api/:path*", destination: `${base}/:path*` }];
  },
  // if ESLint blocks deploy while iterating, set ignoreDuringBuilds: true
  // eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
