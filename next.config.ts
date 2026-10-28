import type { NextConfig } from "next";

/**
 * Baseline security headers. These are applied to every response, including the
 * ones served before a user signs in.
 *
 * The Content-Security-Policy is deliberately narrow in scope: it only stops
 * the portal being framed, which is the clickjacking protection a government
 * portal needs. A full script policy is not set here because Next.js emits
 * inline bootstrap scripts and the chart and animation libraries rely on
 * runtime evaluation; a wrong policy would break the UI rather than protect it.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "bcryptjs", "nodemailer", "node-cron", "otplib"],
  typescript: { ignoreBuildErrors: false },
  // Only affects `next dev`. When the dev server is reached through a tunnel or
  // proxy host, its HMR and font assets are cross-origin and would otherwise be
  // blocked, leaving client components unhydrated. Set DEV_ORIGINS to a
  // comma-separated list of hosts when running behind one.
  allowedDevOrigins: process.env.DEV_ORIGINS?.split(",").map((h) => h.trim()).filter(Boolean),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
