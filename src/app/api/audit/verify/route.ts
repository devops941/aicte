import { jsonOk, withAuth } from "@/lib/api";
import { verifyAuditChain } from "@/lib/audit/writer";

/**
 * Re-walks the audit chain and reports whether it is intact. A single edited or
 * deleted historical row makes this fail, naming the first bad entry.
 */
export const GET = withAuth("audit:read", async () => {
  const result = await verifyAuditChain(10000);
  return jsonOk(result);
});
