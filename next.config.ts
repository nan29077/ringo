import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for AWS (EC2 / ECS / App Runner / Amplify compute).
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "nodemailer"],
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
