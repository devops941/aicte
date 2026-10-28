import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "bcryptjs", "nodemailer", "node-cron", "otplib"],
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
