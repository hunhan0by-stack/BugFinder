import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright and axe must stay Node server dependencies so they share one
  // Playwright runtime instance (required by @axe-core/playwright).
  serverExternalPackages: ["playwright", "@axe-core/playwright", "axe-core"],
};

export default nextConfig;
