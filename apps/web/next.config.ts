import type { NextConfig } from "next";

/**
 * Minimal Phase 2 foundation config — no product-specific settings yet.
 */
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
      },
    ],
  },
  async rewrites() {
    const apiInternalUrl = process.env.API_INTERNAL_URL || "http://localhost:8787";
    return [
      {
        source: "/storage/:path*",
        destination: `${apiInternalUrl}/storage/:path*`,
      },
    ];
  },
};

export default nextConfig;
