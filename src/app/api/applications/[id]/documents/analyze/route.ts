import { z } from "zod";
import { jsonError, jsonOk, parseBody, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/writer";
import { caseDetail } from "@/lib/queries";
import { getStorage } from "@/lib/storage";
import { analyseDocument, extractDocument, specFor } from "@/lib/ai";

const schema = z.object({
  documentId: z.string().uuid(),
});

/**
 * Analyses a stored document against its AICTE specification.
 *
 * The result is advisory and is persisted on the document so a reviewer can
 * see the reasoning later. Nothing here changes a stage, a status or a
 * deadline, and the analysis is recorded in the audit trail as an observation.
 */
export const POST = withAuth("application:read", async ({ actor, req, ip, userAgent }, params) => {
  const application = await caseDetail(actor, params.id);
  if (!application) return jsonError("Application not found in your scope", 404);

  const body = parseBody(schema, await req.json());

  const document = await prisma.document.findFirst({
    where: { id: body.documentId, applicationId: application.id },
  });
  if (!document) return jsonError("Document not found on this application", 404);

  // Recover whatever fields the file exposes, then compare against the spec.
  let extracted: Record<string, unknown> = {};
  let readError: string | null = null;
  try {
    const buffer = await getStorage().get(document.fileKey);
    extracted = extractDocument(buffer, document.mimeType, document.kind);
  } catch {
    // An unreadable file is a finding in itself, not a failed request.
    readError = "The stored file could not be read; it needs manual review.";
  }

  const analysis = analyseDocument({
    kind: document.kind,
    fileName: document.fileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    extracted,
    expiresAt: document.expiresAt,
  });

  if (readError) {
    analysis.findings.unshift({
      code: "UNREADABLE",
      severity: "WARNING",
      message: readError,
      clause: analysis.clause,
    });
    if (analysis.verdict === "COMPLIANT") analysis.verdict = "NEEDS_ATTENTION";
  }

  const spec = specFor(document.kind);

  await prisma.$transaction(async (tx) => {
    await tx.document.update({
      where: { id: document.id },
      data: {
        // Merge with any extraction already stored from upload, so a later
        // analysis never discards fields found earlier.
        extractedJson: { ...(document.extractedJson as object | null), ...extracted, analysis } as never,
      },
    });

    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: "DOCUMENT_ANALYSED",
        entityType: "Document",
        entityId: document.id,
        after: {
          applicationId: application.id,
          kind: document.kind,
          verdict: analysis.verdict,
          score: analysis.score,
          findings: analysis.findings.length,
        },
        ip,
        userAgent,
      },
      tx,
    );
  });

  return jsonOk({
    analysis,
    document: { id: document.id, kind: document.kind, fileName: document.fileName },
    spec: spec ? { title: spec.title, clause: spec.clause, validityMonths: spec.validityMonths ?? null } : null,
  });
});

/** Returns the AICTE specification for a kind, so the UI can show the rules. */
export const GET = withAuth("application:read", async ({ req }, params) => {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  if (!kind) return jsonError("A document kind is required", 422);

  const spec = specFor(kind);
  if (!spec) return jsonError(`No specification is registered for "${kind}"`, 404);

  return jsonOk({ spec });
});
