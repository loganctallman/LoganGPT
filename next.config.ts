import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse uses Node.js built-ins; exclude it from the browser bundle
  serverExternalPackages: ["pdf-parse"],
};

export default nextConfig;
