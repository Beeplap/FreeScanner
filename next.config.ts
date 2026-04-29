import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Needed so Next.js dev HMR resources can be requested from devices on your LAN.
  // (Without this, browsers may block _next/webpack-hmr as cross-origin.)
};

export default nextConfig;
