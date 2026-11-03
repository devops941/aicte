import { NextResponse } from "next/server";
import { jsonError, withAuth } from "@/lib/api";
import { prisma } from "@/lib/db";
import { caseDetail } from "@/lib/queries";
import { getStorage } from "@/lib/storage";

/**
 * Streams a stored document file for inline viewing or download.
 * Scoped to users with permission to read the application.
 */
export const GET = withAuth("application:read", async ({ actor }, params) => {
  const application = await caseDetail(actor, params.id);
  if (!application) return jsonError("Application not found in your scope", 404);

  const document = await prisma.document.findFirst({
    where: { id: params.docId, applicationId: application.id },
  });
  if (!document) return jsonError("Document not found on this application", 404);

  try {
    const buffer = await getStorage().get(document.fileKey);
    const fileNameEncoded = encodeURIComponent(document.fileName);

    const mimeType = document.mimeType || "application/octet-stream";
    // PDFs and images are safe to display inline; everything else must download
    // to prevent an attacker-supplied mimeType from triggering inline XSS.
    const isSafeInline =
      mimeType === "application/pdf" || mimeType.startsWith("image/");
    const disposition = isSafeInline ? "inline" : "attachment";

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `${disposition}; filename*=UTF-8''${fileNameEncoded}`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return jsonError("Document file could not be retrieved from storage", 404);
  }
});
