import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { computeEntryHash, GENESIS_HASH, verifyChain, type ChainEntry } from "./chain";

type Tx = Prisma.TransactionClient;

export type AuditInput = {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Appends one audit entry. Callers pass the transaction client so the audit row
 * commits atomically with the state change it describes: if the write fails the
 * business change rolls back too.
 */
export async function writeAudit(input: AuditInput, tx: Tx | typeof prisma = prisma) {
  const last = await tx.auditLog.findFirst({
    orderBy: { seq: "desc" },
    select: { hash: true },
  });
  const prevHash = last?.hash ?? GENESIS_HASH;
  const createdAt = new Date();
  const hash = computeEntryHash(
    {
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      createdAt,
    },
    prevHash,
  );

  return tx.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      prevHash,
      hash,
      createdAt,
    },
  });
}

export async function loadChain(limit = 5000): Promise<ChainEntry[]> {
  const rows = await prisma.auditLog.findMany({
    orderBy: { seq: "asc" },
    take: limit,
    select: {
      id: true,
      prevHash: true,
      hash: true,
      actorId: true,
      actorEmail: true,
      action: true,
      entityType: true,
      entityId: true,
      before: true,
      after: true,
      createdAt: true,
    },
  });
  return rows as ChainEntry[];
}

export async function verifyAuditChain(limit = 5000) {
  const entries = await loadChain(limit);
  return verifyChain(entries);
}
