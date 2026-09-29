import { config as loadDotenv } from "dotenv";

// Next.js only auto-loads .env.local from this app's own directory
// (apps/web/), but the repo's one true .env.local lives at the monorepo
// root — same convention as the CLI scripts in packages/agents. Load it
// explicitly so API routes that call @hifz/config's loadEnv() see it.
// dotenv never overrides a var that's already set, so this is a no-op in
// deployed environments where Vercel injects real env vars directly.
loadDotenv({ path: "../../.env.local" });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@hifz/agents", "@hifz/config", "@hifz/firewall-core"],
  webpack: (config) => {
    // Our packages use TS's "Bundler" moduleResolution, so internal imports
    // are written as e.g. "./types.js" pointing at "./types.ts". tsc and
    // vitest resolve that automatically; webpack needs to be told to try
    // ".ts"/".tsx" when a ".js" specifier doesn't exist.
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    // pdfjs-dist (the pdf ingest adapter) optionally requires `canvas` for
    // rendering-only DOMMatrix/Path2D polyfills it never actually needs
    // for text extraction. `canvas`'s native binary isn't built in every
    // environment, and webpack tries to statically bundle the require()
    // regardless of the try/catch pdfjs-dist wraps it in — a hard build
    // failure ("Module not found: Can't resolve '.../canvas.node'"), not
    // the graceful runtime warning plain Node produces for the same
    // require(). `serverExternalPackages` doesn't reach this (firewall-core
    // is transpiled, and its dependency's dependency isn't excluded by
    // it) — aliasing straight to `false` is webpack's own standard fix for
    // this exact "optional native canvas dependency" problem.
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
};

export default nextConfig;
