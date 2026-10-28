import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Permite abrir o dev server pelo IP da rede local (telemóvel/kiosk) sem bloquear o JS.
  allowedDevOrigins: ["192.168.*.*"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
