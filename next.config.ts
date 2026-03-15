import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return {
      beforeFiles: [
        // console.bestdecks.co → /console (production subdomain routing)
        {
          source: "/:path*",
          has: [{ type: "host", value: "console.bestdecks.co" }],
          destination: "/console/:path*",
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async redirects() {
    return [
      // On main domain, /console → console.bestdecks.co (production only)
      {
        source: "/console/:path*",
        has: [{ type: "host", value: "bestdecks.co" }],
        destination: "https://console.bestdecks.co/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
