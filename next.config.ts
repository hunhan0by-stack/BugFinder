import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright must stay a Node server dependency, not a bundled client module.
  serverExternalPackages: ["playwright"],
};

export default nextConfig;
