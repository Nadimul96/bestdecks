import type { NextConfig } from "next";

// The application is compiled into `.next`; none of these repository sources
// or operator-owned data files belong in the standalone runtime. This is also
// a defense-in-depth boundary if output tracing encounters a dynamic fs path.
const standaloneTraceExcludes = [
  "./.agents/**/*",
  "./.claude/**/*",
  "./.codex/**/*",
  "./.data/**/*",
  "./.git/**/*",
  "./.github/**/*",
  "./app_data/**/*",
  "./.env",
  "./.env.*",
  "./*.sqlite",
  "./*.sqlite-*",
  "./*.db",
  "./*.db-*",
  "./CODE_OF_CONDUCT.md",
  "./CONTRIBUTING.md",
  "./IMPLEMENTATION-PLAN.md",
  "./PROJECT_CONTEXT.md",
  "./README.md",
  "./ROADMAP.md",
  "./SECURITY.md",
  "./CHANGELOG.md",
  "./next.config.ts",
  "./proxy.ts",
  "./render.yaml",
  "./tsconfig*.json",
  "./vercel.json",
] as string[];

const nextConfig: NextConfig = {
  output: "standalone",
  // libSQL ships native `.node` binaries and resolves platform packages at
  // runtime. Let Node load that graph; bundling it makes Webpack traverse the
  // package's dynamic require context and attempt to parse binaries/READMEs.
  serverExternalPackages: ["@libsql/client", "@libsql/kysely-libsql", "libsql"],
  outputFileTracingIncludes: {
    // `libsql` resolves its platform package dynamically, which Node file
    // tracing cannot discover. Include the package adjacent to each installed
    // libsql version so pnpm never falls through to a mismatched native build.
    "/*": [
      "./node_modules/.pnpm/libsql@*/node_modules/@libsql/*/index.node",
      "./node_modules/.pnpm/libsql@*/node_modules/@libsql/*/package.json",
    ],
  },
  outputFileTracingExcludes: {
    "/*": standaloneTraceExcludes,
  },
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
