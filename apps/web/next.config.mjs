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
    return config;
  },
};

export default nextConfig;
