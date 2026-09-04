import crypto from "node:crypto";

export interface PutObjectResult {
  storageKey: string;
  sha256: string;
  bytes: number;
}

export interface StorageAdapter {
  putObject(
    key: string,
    data: Buffer | Uint8Array | string,
    mimeType?: string
  ): Promise<PutObjectResult>;

  getObject(key: string): Promise<Buffer>;

  deleteObject(key: string): Promise<void>;

  exists(key: string): Promise<boolean>;

  resolveLocalPath?(key: string): string;
}

export function computeSha256(data: Buffer | Uint8Array | string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}
