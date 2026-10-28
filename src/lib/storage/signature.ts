/**
 * File-content sniffing for uploads.
 *
 * The browser-supplied MIME type and file extension are attacker-controlled:
 * renaming `payload.exe` to `plan.pdf` and sending `Content-Type: application/pdf`
 * passes both. The bytes do not lie, so uploads are checked against the magic
 * number of the format they claim to be. This is a real control, not a
 * substitute for antivirus: it rejects mislabelled files, but a malicious
 * *valid* PDF still passes. Malware scanning is a separate, unconfigured
 * integration (see `scanForMalware` below).
 */

export type Signature = {
  mimeType: string;
  /** Byte offsets and the exact values expected at each. */
  magic: { offset: number; bytes: number[] }[];
  /** Optional byte offset where the format's marker string must appear. */
  marker?: { offset: number; ascii: string };
};

const SIGNATURES: Signature[] = [
  // %PDF-
  { mimeType: "application/pdf", magic: [{ offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] }] },
  // \x89PNG\r\n\x1a\n
  { mimeType: "image/png", magic: [{ offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] }] },
  // FFD8FF (JPEG, several variants)
  { mimeType: "image/jpeg", magic: [{ offset: 0, bytes: [0xff, 0xd8, 0xff] }] },
  // RIFF....WEBP
  {
    mimeType: "image/webp",
    magic: [
      { offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
      { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
    ],
  },
  // PK\x03\x04 — a ZIP container, which is what both OOXML formats are.
  {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    magic: [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }],
  },
  {
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    magic: [{ offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] }],
  },
];

function matches(buffer: Buffer, signature: Signature): boolean {
  return signature.magic.every(({ offset, bytes }) => {
    if (buffer.length < offset + bytes.length) return false;
    return bytes.every((b, i) => buffer[offset + i] === b);
  });
}

/**
 * Returns the MIME type the bytes actually look like, or null when nothing
 * matches. CSV is text and has no magic number, so it is reported separately by
 * `looksLikeText`.
 */
export function sniffMimeType(buffer: Buffer): string | null {
  for (const signature of SIGNATURES) {
    if (matches(buffer, signature)) return signature.mimeType;
  }
  return null;
}

/** True when the buffer is plausibly UTF-8/ASCII text, used to accept CSV. */
export function looksLikeText(buffer: Buffer): boolean {
  // A NUL byte in the first block is the giveaway for binary content.
  const sample = buffer.subarray(0, 4096);
  return !sample.includes(0x00);
}

export type SniffResult = { ok: true } | { ok: false; reason: string };

/**
 * Checks a buffer against the MIME type it claims. ZIP-based Office documents
 * and CSV are handled specially because their magic numbers are shared or
 * absent.
 */
export function verifyUpload(buffer: Buffer, claimedMimeType: string): SniffResult {
  if (buffer.length === 0) return { ok: false, reason: "The file is empty" };

  const sniffed = sniffMimeType(buffer);

  if (claimedMimeType === "text/csv") {
    if (!looksLikeText(buffer)) {
      return { ok: false, reason: "The file claims to be CSV but contains binary data" };
    }
    return { ok: true };
  }

  if (!sniffed) {
    return { ok: false, reason: "The file content does not match any accepted format" };
  }

  // Both OOXML formats share the ZIP header, so a .docx and .xlsx are
  // indistinguishable at the byte level. Accept either when the claim is one of
  // them; the extension is not security-relevant on its own.
  const ooxml = new Set([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ]);
  if (ooxml.has(claimedMimeType) && ooxml.has(sniffed)) return { ok: true };

  if (sniffed !== claimedMimeType) {
    return { ok: false, reason: `The file content is ${sniffed}, not ${claimedMimeType}` };
  }

  return { ok: true };
}

/**
 * Malware scanning hook. No engine is configured, so this reports that uploads
 * are signature-checked but not virus-scanned. Wire a ClamAV or API-based
 * scanner in here; callers already treat a non-null return as a rejection.
 */
export function scanForMalware(_buffer: Buffer): string | null {
  return null;
}
