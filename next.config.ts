import type { NextConfig } from "next";

/**
 * Preview tunnels (cloudflared quick tunnels) get a new hostname on every run, so the host is read
 * from PREVIEW_HOST rather than hard-coded here. A bare host or a full URL both work, e.g.
 * PREVIEW_HOST=https://your-name.trycloudflare.com in .env.local. Unset means localhost only.
 */
const previewHost = process.env.PREVIEW_HOST?.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
const previewHosts = previewHost ? [previewHost] : [];

const nextConfig: NextConfig = {
  // Self-contained server bundle for AWS (EC2 / ECS / App Runner / Amplify compute).
  output: "standalone",
  poweredByHeader: false,
  // Dev-server requests arriving from the preview tunnel instead of localhost.
  allowedDevOrigins: previewHosts,
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "nodemailer"],
  experimental: {
    // allowedOrigins also covers `next start`, where allowedDevOrigins does not apply: without it a
    // server action submitted through the tunnel is rejected as a cross-origin request.
    serverActions: { bodySizeLimit: "2mb", allowedOrigins: previewHosts },
  },
};

export default nextConfig;
