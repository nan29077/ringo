import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for AWS (EC2 / ECS / App Runner / Amplify compute).
  output: "standalone",
  poweredByHeader: false,
  // Allow the current local preview tunnel; update this host when the tunnel URL changes.
  allowedDevOrigins: ["jam-tennis-bargain-stands.trycloudflare.com"],
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "nodemailer"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
