import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Needed so Next.js dev HMR resources can be requested from devices on your LAN.
  // (Without this, browsers may block _next/webpack-hmr as cross-origin.)
  allowedDevOrigins: ["192.168.1.115"],
  // Silence the “workspace root inferred” warning caused by multiple lockfiles.
  // This keeps Turbopack rooted at this Next.js app directory.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
