import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const nextConfig: NextConfig = {
  // Export as fully static site in production so FastAPI can serve it.
  // In development Next.js runs its own dev server as usual.
  ...(isProd && {
    output: "export",
    trailingSlash: true,   // /apply  →  out/apply/index.html
    distDir: "out",        // output directory
  }),
  // Silence annoying build‑time image‑optimisation warning for static export
  images: { unoptimized: true },
};

export default nextConfig;
