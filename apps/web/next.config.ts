import type { NextConfig } from "next";

// `NEXT_OUTPUT=export next build` gera o site estático para o Cloudflare Pages (pasta out/).
// Lá a API é uma Pages Function em /api e os redirecionamentos vivem em public/_redirects;
// o proxy de /api e os redirects abaixo só servem o `next dev`.
const pages = process.env.NEXT_OUTPUT === "export";

const nextConfig: NextConfig = {
  ...(pages ? { output: "export" as const, distDir: "out", trailingSlash: false } : {}),
  // Permite abrir o dev server pelo IP da rede local e pelo túnel HTTPS (telemóvel/kiosk) sem bloquear o JS.
  allowedDevOrigins: ["192.168.*.*", "*.trycloudflare.com"],
  // A API vive em /api na mesma origem da web: um só HTTPS (exigido pelo Web NFC e pelo PWA),
  // sem CORS, e o telemóvel nunca precisa de chegar a localhost:4000.
  ...(pages ? {} : {
    async rewrites() {
      const api = process.env.API_INTERNAL_URL ?? "http://localhost:4000";
      return [{ source: "/api/:path*", destination: `${api}/api/:path*` }];
    },
    // A app não tem rotas por idioma; /pt, /pt-PT, /en... (links antigos ou redirecionamentos
    // guardados pelo navegador) levam à mesma página sem o prefixo.
    async redirects() {
      const locale = ":locale(pt|pt-PT|pt-BR|pt-CV|en|en-US|es|fr)";
      return [
        { source: `/${locale}`, destination: "/", permanent: false },
        { source: `/${locale}/:path*`, destination: "/:path*", permanent: false },
      ];
    },
  }),
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
