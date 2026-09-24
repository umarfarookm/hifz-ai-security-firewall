/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@hifz/agents", "@hifz/config", "@hifz/firewall-core"],
};

export default nextConfig;
