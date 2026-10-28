import type { NextAuthConfig, Session } from "next-auth";

/**
 * Edge-safe half of the auth configuration.
 *
 * Middleware runs on the edge runtime, where Prisma and bcrypt are unavailable,
 * so this file deliberately imports neither. It only describes pages, the JWT
 * session strategy and the token/session mapping. The credentials provider that
 * needs the database is added in `src/auth.ts`, which runs on Node.
 */

export const PUBLIC_PATHS = ["/login", "/api/auth", "/api/health", "/api/worker", "/verify", "/"];

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = (user as { id?: string }).id;
        token.role = (user as { role?: string }).role;
        token.regionId = (user as { regionId?: string | null }).regionId ?? null;
        token.institutionId = (user as { institutionId?: string | null }).institutionId ?? null;
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? "";
        session.user.role = (token.role as Session["user"]["role"]) ?? "AUDITOR";
        session.user.regionId = (token.regionId as string | null) ?? null;
        session.user.institutionId = (token.institutionId as string | null) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
