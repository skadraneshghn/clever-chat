import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* ── Production Optimization ─────────────────────────────────────── */
  output: "standalone",  // Optimized for containerized/cloud deployment (smaller image)
  
  /* ── Image Optimization ──────────────────────────────────────────── */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },

  /* ── Environment ─────────────────────────────────────────────────── */
  env: {
    NEXT_PUBLIC_APP_NAME: "CleverChat",
  },

  /* ── Headers ─────────────────────────────────────────────────────── */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
