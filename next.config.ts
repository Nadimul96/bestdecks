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
        // Exclude /api/*, /login, /signup so auth routes work on subdomain
        {
          source: "/:path((?!api|login|signup|_next).*)*",
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
      // console.bestdecks.co/login → bestdecks.co/login (keep auth on main domain)
      {
        source: "/login",
        has: [{ type: "host", value: "console.bestdecks.co" }],
        destination: "https://bestdecks.co/login",
        permanent: false,
      },
      {
        source: "/signup",
        has: [{ type: "host", value: "console.bestdecks.co" }],
        destination: "https://bestdecks.co/signup",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
