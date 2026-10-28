import { createHash, randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { scanForMalware, verifyUpload } from "./signature";

/**
 * Storage abstraction. The local driver writes outside the web root and files
 * are only ever served through an authorised route handler, never statically.
 * An S3 or ImageKit driver can implement the same interface later.
 */

export type StoredFile = {
  key: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string;
};

export interface StorageDriver {
  readonly name: string;
  put(file: { buffer: Buffer; fileName: string; mimeType: string; ownerType: string; ownerId: string }): Promise<StoredFile>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
]);

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function assertUploadAllowed(mimeType: string, sizeBytes: number): void {
  if (!ALLOWED_MIME.has(mimeType)) {
    throw new Error(`File type ${mimeType} is not allowed`);
  }
  if (sizeBytes > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds the ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB limit`);
  }
}

/** Strips path separators and traversal sequences from a user-supplied name. */
export function sanitiseFileName(name: string): string {
  const base = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.replace(/\.{2,}/g, ".").slice(0, 180) || "upload";
}

class LocalStorageDriver implements StorageDriver {
  readonly name = "local";
  private root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolveSafe(key: string): string {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(this.root + path.sep) && target !== this.root) {
      throw new Error("Resolved path escapes the storage root");
    }
    return target;
  }

  async put({ buffer, fileName, mimeType, ownerType, ownerId }: { buffer: Buffer; fileName: string; mimeType: string; ownerType: string; ownerId: string }): Promise<StoredFile> {
    assertUploadAllowed(mimeType, buffer.byteLength);
    // The declared MIME type comes from the client and cannot be trusted; check
    // the bytes before anything is written to disk.
    const sniff = verifyUpload(buffer, mimeType);
    if (!sniff.ok) throw new Error(sniff.reason);
    const malware = scanForMalware(buffer);
    if (malware) throw new Error(malware);

    const safeName = sanitiseFileName(fileName);
    const key = path.posix.join(ownerType.toLowerCase(), ownerId, `${randomUUID()}-${safeName}`);
    const target = this.resolveSafe(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, buffer, { mode: 0o640 });
    return {
      key,
      fileName: safeName,
      mimeType,
      sizeBytes: buffer.byteLength,
      checksum: createHash("sha256").update(buffer).digest("hex"),
    };
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolveSafe(key));
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.resolveSafe(key), { force: true });
  }
}

export function getStorage(): StorageDriver {
  const driver = process.env.STORAGE_DRIVER ?? "local";
  if (driver === "local") {
    return new LocalStorageDriver(process.env.STORAGE_LOCAL_DIR ?? "./var/uploads");
  }
  throw new Error(`Storage driver "${driver}" is not implemented; add an adapter behind this interface.`);
}
