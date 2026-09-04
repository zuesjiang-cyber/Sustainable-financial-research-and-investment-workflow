import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import {
  StorageAdapter,
  PutObjectResult,
  computeSha256,
} from "./storageAdapter";

export class LocalStorageAdapter implements StorageAdapter {
  private readonly baseDir: string;

  constructor(baseDir: string = path.resolve("storage")) {
    this.baseDir = path.resolve(baseDir);
    if (!fsSync.existsSync(this.baseDir)) {
      fsSync.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private getFullPath(key: string): string {
    // Sanitize key to prevent path traversal
    const safeKey = key.replace(/^\/+/, "").replace(/\.\./g, "");
    return path.join(this.baseDir, safeKey);
  }

  async putObject(
    key: string,
    data: Buffer | Uint8Array | string,
    _mimeType?: string
  ): Promise<PutObjectResult> {
    const fullPath = this.getFullPath(key);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    const buffer = Buffer.isBuffer(data)
      ? data
      : typeof data === "string"
      ? Buffer.from(data, "utf-8")
      : Buffer.from(data);

    const sha256 = computeSha256(buffer);
    await fs.writeFile(fullPath, buffer);

    return {
      storageKey: key,
      sha256,
      bytes: buffer.byteLength,
    };
  }

  async getObject(key: string): Promise<Buffer> {
    const fullPath = this.getFullPath(key);
    return await fs.readFile(fullPath);
  }

  async deleteObject(key: string): Promise<void> {
    const fullPath = this.getFullPath(key);
    try {
      await fs.unlink(fullPath);
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    const fullPath = this.getFullPath(key);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  resolveLocalPath(key: string): string {
    return this.getFullPath(key);
  }
}
