import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth/config";

const LOCK_THRESHOLD = 5;
const LOCK_MINUTES = 15;

const credentialsSchema = z.object({
  email: z.string().min(3),
  password: z.string().min(1),
  totp: z.string().optional(),
});

/**
 * Node-side auth. The credentials provider checks the password with bcrypt and,
 * when the user has enabled it, a TOTP code. Repeated failures lock the account
 * for a cooling-off period rather than allowing unlimited attempts.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
        totp: { label: "Authenticator code", type: "text" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password, totp } = parsed.data;

        const user = await prisma.user.findFirst({
          where: { email: { equals: email.trim(), mode: "insensitive" } },
        });
        if (!user || !user.isActive) return null;

        if (user.lockedUntil && user.lockedUntil > new Date()) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          // Increment atomically. Reading the count, adding one and writing it
          // back would let simultaneous guesses read the same value and each
          // write the same next value, so a burst of parallel attempts could
          // stay under the threshold and never trigger the lockout.
          const updated = await prisma.user.update({
            where: { id: user.id },
            data: { failedLoginCount: { increment: 1 } },
            select: { failedLoginCount: true },
          });
          if (updated.failedLoginCount >= LOCK_THRESHOLD) {
            await prisma.user.update({
              where: { id: user.id },
              data: { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) },
            });
          }
          return null;
        }

        if (user.totpEnabled && user.totpSecret) {
          if (!totp) return null;
          const ok = authenticator.verify({ token: totp.replace(/\s/g, ""), secret: user.totpSecret });
          if (!ok) return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          regionId: user.regionId,
          institutionId: user.institutionId,
        };
      },
    }),
  ],
});
