import { jsonError, jsonOk, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit/writer";
import { caseDetail } from "@/lib/queries";
import { getStorage } from "@/lib/storage";
import { preCheckDocument } from "@/lib/ai";
import { CHECKLIST_BY_TYPE } from "@/lib/constants";

const MAX_BYTES = 10 * 1024 * 1024;

/** Uploads a document against an application, after checking scope and size. */
export const POST = withAuth("application:update", async ({ actor, req, ip, userAgent }, params) => {
  const application = await caseDetail(actor, params.id);
  if (!application) return jsonError("Application not found in your scope", 404);

  // Reject on the declared length before reading the body. Next.js truncates
  // requests over its own body limit, which would otherwise make formData()
  // throw and surface as a generic error instead of a clear rejection.
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES + 1024 * 64) {
    return jsonError(`File exceeds the ${MAX_BYTES / 1024 / 1024}MB limit`, 413);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(`The upload could not be read. Files must be under ${MAX_BYTES / 1024 / 1024}MB.`, 413);
  }

  const file = form.get("file");
  const kind = String(form.get("kind") ?? "").trim();
  const label = String(form.get("label") ?? "").trim();
  const expiresAtRaw = form.get("expiresAt");

  if (!(file instanceof File)) return jsonError("A file is required", 422);
  if (!kind) return jsonError("A document kind is required", 422);
  if (file.size > MAX_BYTES) return jsonError("File exceeds the 10MB limit", 413);

  const allowed = CHECKLIST_BY_TYPE[application.type] ?? [];
  if (allowed.length > 0 && !allowed.some((a) => a.kind === kind)) {
    return jsonError(`"${kind}" is not part of the checklist for this application type`, 422);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storage = getStorage();

  let stored;
  try {
    stored = await storage.put({
      buffer,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      ownerType: "APPLICATION",
      ownerId: application.id,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Upload rejected", 422);
  }

  const check = preCheckDocument({
    fileName: stored.fileName,
    mimeType: stored.mimeType,
    extracted: null,
    expectedKind: kind,
    requiredFields: [],
  });

  const document = await prisma.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        ownerType: "APPLICATION",
        ownerId: application.id,
        applicationId: application.id,
        kind,
        label: label || allowed.find((a) => a.kind === kind)?.label || kind,
        fileKey: stored.key,
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        expiresAt: expiresAtRaw ? new Date(String(expiresAtRaw)) : null,
        extractedJson: { preCheck: check } as never,
        uploadedById: actor.id,
      },
    });

    await writeAudit(
      {
        actorId: actor.id,
        actorEmail: actor.email,
        action: "DOCUMENT_UPLOADED",
        entityType: "Document",
        entityId: created.id,
        after: { applicationId: application.id, kind, fileName: created.fileName, sizeBytes: created.sizeBytes },
        ip,
        userAgent,
      },
      tx,
    );

    return created;
  });

  return jsonOk({ document, preCheck: check }, 201);
});

/** Streams a stored document back, but only to a viewer inside its scope. */
export const GET = withAuth("application:read", async ({ actor }, params) => {
  const application = await caseDetail(actor, params.id);
  if (!application) return jsonError("Application not found in your scope", 404);

  const documents = await prisma.document.findMany({
    where: { applicationId: application.id },
    orderBy: { createdAt: "desc" },
  });
  return jsonOk({ documents });
});
