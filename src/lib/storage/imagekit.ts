import ImageKit from "imagekit";
import { createHash } from "crypto";
import { assertUploadAllowed, sanitiseFileName, type StorageDriver, type StoredFile } from "./index";
import { scanForMalware, verifyUpload } from "./signature";

/**
 * ImageKit cloud storage driver.
 * Uses ImageKit REST/Node SDK to upload files, generate unique CDN URLs, and manage documents.
 */
export class ImageKitStorageDriver implements StorageDriver {
  readonly name = "imagekit";
  private ik: ImageKit;

  constructor() {
    const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
    const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;

    if (!publicKey || !privateKey || !urlEndpoint) {
      throw new Error(
        "Missing ImageKit credentials. Please ensure IMAGEKIT_PUBLIC_KEY, IMAGEKIT_PRIVATE_KEY, and IMAGEKIT_URL_ENDPOINT are set in .env",
      );
    }

    this.ik = new ImageKit({
      publicKey,
      privateKey,
      urlEndpoint,
    });
  }

  async put({
    buffer,
    fileName,
    mimeType,
    ownerType,
    ownerId,
  }: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    ownerType: string;
    ownerId: string;
  }): Promise<StoredFile> {
    assertUploadAllowed(mimeType, buffer.byteLength);

    const sniff = verifyUpload(buffer, mimeType);
    if (!sniff.ok) throw new Error(sniff.reason);

    const malware = scanForMalware(buffer);
    if (malware) throw new Error(malware);

    const safeName = sanitiseFileName(fileName);
    const folder = `/aicte/${ownerType.toLowerCase()}/${ownerId}`;

    const res = await this.ik.upload({
      file: buffer.toString("base64"),
      fileName: safeName,
      folder,
      useUniqueFileName: true,
      isPrivateFile: true,
    });

    return {
      key: res.filePath ?? res.url,
      fileName: res.name || safeName,
      mimeType,
      sizeBytes: res.size || buffer.byteLength,
      checksum: createHash("sha256").update(buffer).digest("hex"),
    };
  }

  async get(key: string): Promise<Buffer> {
    if (key.startsWith("/")) {
      // Path-based key (new format) — generate a short-lived signed URL so the
      // file is never accessible without authentication.
      const signedUrl = this.ik.url({ path: key, signed: true, expireSeconds: 300 });
      const response = await fetch(signedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch private file from ImageKit: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    if (key.startsWith("http://") || key.startsWith("https://")) {
      // Legacy fallback: keys stored as full CDN URLs before the private-file migration.
      const response = await fetch(key);
      if (!response.ok) {
        throw new Error(`Failed to fetch file from ImageKit: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    throw new Error(`Invalid ImageKit storage key: ${key}`);
  }

  async remove(key: string): Promise<void> {
    try {
      let filePath: string;
      if (key.startsWith("/")) {
        // Path-based key (new format) — use directly without URL parsing.
        filePath = key;
      } else {
        // Legacy fallback: key is a full CDN URL; extract path from it.
        const url = new URL(key);
        filePath = decodeURIComponent(url.pathname);
      }
      const files = await this.ik.listFiles({
        searchQuery: `filePath = "${filePath}"`,
        limit: 1,
      });
      // listFiles returns files and folders; only a file carries a fileId.
      const first = files?.[0];
      if (first && "fileId" in first) {
        await this.ik.deleteFile(first.fileId);
      }
    } catch {
      // Best-effort cleanup
    }
  }
}

