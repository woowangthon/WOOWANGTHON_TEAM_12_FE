import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // [실험 · 머지 금지] BE#42 — Vercel 이 부르면 Cloudflare 어느 지점(colo)에 붙나 확인
  async rewrites() {
    return [{ source: "/cf-trace", destination: "https://api-woowang.miroda.live/cdn-cgi/trace" }];
  },
  partialPrefetching: true,
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
