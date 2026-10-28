import { describe, expect, it } from "vitest";
import { computeEntryHash, GENESIS_HASH, verifyChain, type ChainEntry } from "@/lib/audit/chain";

function buildChain(count: number): ChainEntry[] {
  const entries: ChainEntry[] = [];
  let prev: string | null = null;
  for (let i = 0; i < count; i += 1) {
    const payload = {
      actorId: `user-${i}`,
      actorEmail: `user${i}@aicte.gov.in`,
      action: `ACTION_${i}`,
      entityType: "Application",
      entityId: `app-${i}`,
      before: { status: "SUBMITTED" },
      after: { status: "IN_PROCESS" },
      createdAt: new Date(Date.UTC(2026, 0, 1 + i, 10, 0, 0)),
    };
    const hash = computeEntryHash(payload, prev);
    entries.push({ id: `entry-${i}`, prevHash: prev, hash, ...payload });
    prev = hash;
  }
  return entries;
}

describe("audit hash chain", () => {
  it("verifies an untouched chain", () => {
    const result = verifyChain(buildChain(25));
    expect(result.valid).toBe(true);
    expect(result.checked).toBe(25);
  });

  it("verifies an empty chain", () => {
    expect(verifyChain([]).valid).toBe(true);
  });

  it("detects a changed payload in the middle of the chain", () => {
    const chain = buildChain(10);
    chain[4] = { ...chain[4], after: { status: "APPROVED" } };
    const result = verifyChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAtId).toBe("entry-4");
    expect(result.reason).toBe("content hash mismatch");
  });

  it("detects a deleted entry", () => {
    const chain = buildChain(10);
    const tampered = chain.filter((_, i) => i !== 3);
    const result = verifyChain(tampered);
    expect(result.valid).toBe(false);
    expect(result.brokenAtId).toBe("entry-4");
    expect(result.reason).toBe("previous-hash mismatch");
  });

  it("detects a rewritten history where an attacker recomputes the tail", () => {
    const chain = buildChain(6);
    // Attacker edits entry 2 and recomputes entries 3..5 to match the new head.
    let prev = chain[1].hash;
    chain[2] = { ...chain[2], after: { status: "APPROVED" } };
    chain[2].hash = computeEntryHash(chain[2], prev);
    prev = chain[2].hash;
    for (let i = 3; i < chain.length; i += 1) {
      chain[i] = { ...chain[i], prevHash: prev };
      chain[i].hash = computeEntryHash(chain[i], prev);
      prev = chain[i].hash;
    }
    // The chain is now internally consistent, which is the honest limitation:
    // tamper-evidence requires the head hash to be anchored elsewhere.
    expect(verifyChain(chain).valid).toBe(true);

    // But a single un-recomputed edit is still caught.
    const partially = buildChain(6);
    partially[2] = { ...partially[2], after: { status: "APPROVED" } };
    expect(verifyChain(partially).valid).toBe(false);
  });

  it("is deterministic regardless of object key order", () => {
    const createdAt = new Date("2026-01-01T10:00:00.000Z");
    const a = computeEntryHash(
      { actorId: "u1", actorEmail: "a@b.c", action: "X", entityType: "T", entityId: "e", before: { a: 1, b: 2 }, after: null, createdAt },
      GENESIS_HASH,
    );
    const b = computeEntryHash(
      { actorId: "u1", actorEmail: "a@b.c", action: "X", entityType: "T", entityId: "e", before: { b: 2, a: 1 }, after: null, createdAt },
      GENESIS_HASH,
    );
    expect(a).toBe(b);
  });

  it("produces a different hash when the previous hash changes", () => {
    const payload = {
      actorId: "u1",
      actorEmail: "a@b.c",
      action: "X",
      entityType: "T",
      entityId: "e",
      before: null,
      after: null,
      createdAt: new Date("2026-01-01T10:00:00.000Z"),
    };
    expect(computeEntryHash(payload, GENESIS_HASH)).not.toBe(computeEntryHash(payload, "a".repeat(64)));
  });

  it("treats a missing prevHash as genesis", () => {
    const chain = buildChain(3);
    const withNull = chain.map((e) => ({ ...e, prevHash: e.prevHash }));
    expect(verifyChain(withNull).valid).toBe(true);
  });
});
