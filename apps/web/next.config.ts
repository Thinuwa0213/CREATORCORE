import type { NextConfig } from "next";

/**
 * Minimal Phase 2 foundation config — no product-specific settings yet.
 */
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.discordapp.com",
      },
    ],
  },
};

export default nextConfig;
