import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma 7 connects through a driver adapter rather than reading a URL from the
 * schema. The pg adapter owns the connection pool, and transactions still run
 * on a single pooled connection, so transaction-scoped advisory locks used to
 * serialise the audit chain and application numbers keep their meaning.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Exposed so scripts and tests connect through the same adapter configuration. */
export { createClient as createPrismaClient };
