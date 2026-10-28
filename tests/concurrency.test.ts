import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/db";
import { writeAudit } from "@/lib/audit/writer";
import { nextApplicationNo } from "@/lib/workflow/service";
import { verifyChain, type ChainEntry } from "@/lib/audit/chain";

/**
 * The audit chain is tamper-evident only if every append links to the true tail.
 * Appending is a read (previous hash) followed by an insert, so without
 * serialisation concurrent appends read the same predecessor and fork the
 * chain. These tests drive real concurrent writers against the database and
 * then re-verify the chain the same way the /api/audit/verify route does.
 *
 * Rows created here are namespaced and removed in afterAll.
 */
const prisma = createPrismaClient();
const PREFIX = `ATEST-${Date.now()}`;

async function chainTailIsIntact() {
  const entries = (await prisma.auditLog.findMany({
    orderBy: { seq: "asc" },
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
  })) as ChainEntry[];
  return verifyChain(entries);
}

beforeAll(async () => {
  // Confirm the database is reachable and start from a verified chain.
  const baseline = await chainTailIsIntact();
  expect(baseline.valid).toBe(true);
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

describe("application number allocation", () => {
  it("hands out unique, consecutive numbers under concurrent creation", async () => {
    // Reserve a region and institution for the rows this test creates.
    const region = await prisma.region.create({ data: { code: `${PREFIX}-NO-REG`, name: `${PREFIX} No Region` } });
    const institution = await prisma.institution.create({
      data: { aicteId: `${PREFIX}-NO-INST`, name: `${PREFIX} No Institute`, state: "Test State", regionId: region.id },
    });

    const writers = 15;
    const created = await Promise.all(
      Array.from({ length: writers }, () =>
        prisma.$transaction(async (tx) => {
          const appNo = await nextApplicationNo(tx);
          return tx.application.create({
            data: {
              appNo,
              type: "NEW_ENGINEERING",
              title: `${PREFIX} concurrent creation`,
              institutionId: institution.id,
              regionId: region.id,
            },
          });
        }),
      ),
    );

    const numbers = created.map((a) => a.appNo);
    expect(new Set(numbers).size).toBe(writers);

    const year = new Date().getFullYear();
    const prefix = `APP-${year}-`;
    const sequences = numbers
      .filter((n) => n.startsWith(prefix))
      .map((n) => Number.parseInt(n.slice(prefix.length), 10))
      .sort((a, b) => a - b);
    for (let i = 1; i < sequences.length; i += 1) {
      expect(sequences[i]).toBe(sequences[i - 1] + 1);
    }

    await prisma.application.deleteMany({ where: { appNo: { in: numbers } } });
    await prisma.institution.delete({ where: { id: institution.id } });
    await prisma.region.delete({ where: { id: region.id } });
  });
});

describe("audit chain concurrency", () => {
  it("keeps the chain linear under concurrent appends", async () => {
    const writers = 24;

    // Fire every append at once. Each call opens its own transaction, so the
    // advisory lock is the only thing serialising them.
    await Promise.all(
      Array.from({ length: writers }, (_, i) =>
        writeAudit({
          actorEmail: `${PREFIX}-${i}@test.local`,
          action: `CONCURRENT_APPEND_${i}`,
          entityType: "Test",
          entityId: `${PREFIX}-${i}`,
          after: { index: i },
        }),
      ),
    );

    const created = await prisma.auditLog.count({ where: { entityId: { startsWith: PREFIX } } });
    expect(created).toBe(writers);

    const result = await chainTailIsIntact();
    expect(result.valid).toBe(true);
  });

  it("keeps the chain linear when appends run inside larger transactions", async () => {
    const writers = 12;

    await Promise.all(
      Array.from({ length: writers }, (_, i) =>
        prisma.$transaction(async (tx) => {
          await writeAudit(
            {
              actorEmail: `${PREFIX}-tx-${i}@test.local`,
              action: `TX_APPEND_${i}`,
              entityType: "Test",
              entityId: `${PREFIX}-tx-${i}`,
              after: { index: i },
            },
            tx,
          );
        }),
      ),
    );

    const result = await chainTailIsIntact();
    expect(result.valid).toBe(true);
  });
});
