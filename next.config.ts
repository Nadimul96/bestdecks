import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return {
      beforeFiles: [
        // console.bestdecks.co/ → /console (root only)
        // All other paths (/login, /api/*, /console) work normally
        {
          source: "/",
          has: [{ type: "host", value: "console.bestdecks.co" }],
          destination: "/console",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
