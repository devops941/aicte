import { createHash } from "crypto";

/**
 * Append-only, tamper-evident audit log.
 *
 * Each entry hashes its own payload together with the previous entry's hash, so
 * changing any historical row invalidates every hash after it. The application
 * only ever inserts: there is no update or delete code path for audit rows.
 */

export const GENESIS_HASH = "0".repeat(64);

export type AuditPayload = {
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: Date;
};

/**
 * Stable serialisation: keys are sorted so the same logical payload always
 * produces the same hash, independent of object key insertion order.
 */
function canonicalise(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function computeEntryHash(payload: AuditPayload, prevHash: string | null): string {
  const body = canonicalise({
    actorId: payload.actorId,
    actorEmail: payload.actorEmail,
    action: payload.action,
    entityType: payload.entityType,
    entityId: payload.entityId,
    before: payload.before ?? null,
    after: payload.after ?? null,
    createdAt: payload.createdAt.toISOString(),
  });
  return createHash("sha256").update(`${prevHash ?? GENESIS_HASH}|${body}`).digest("hex");
}

export type ChainEntry = {
  id: string;
  prevHash: string | null;
  hash: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: Date;
};

export type VerificationResult = {
  valid: boolean;
  checked: number;
  brokenAtId?: string;
  reason?: string;
};

/**
 * Re-walks the chain in insertion order and recomputes every hash. Returns the
 * id of the first entry whose stored hash does not match, which is exactly the
 * signal that a row was edited or removed.
 */
export function verifyChain(entries: ChainEntry[]): VerificationResult {
  let prevHash: string | null = null;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const expectedPrev = i === 0 ? GENESIS_HASH : entries[i - 1].hash;
    if ((entry.prevHash ?? GENESIS_HASH) !== expectedPrev) {
      return { valid: false, checked: i, brokenAtId: entry.id, reason: "previous-hash mismatch" };
    }
    const expected = computeEntryHash(
      {
        actorId: entry.actorId,
        actorEmail: entry.actorEmail,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before,
        after: entry.after,
        createdAt: entry.createdAt,
      },
      entry.prevHash,
    );
    if (expected !== entry.hash) {
      return { valid: false, checked: i, brokenAtId: entry.id, reason: "content hash mismatch" };
    }
    prevHash = entry.hash;
  }
  return { valid: true, checked: entries.length };
}
