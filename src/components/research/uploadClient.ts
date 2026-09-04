import type { UploadReceipt } from "../../shared/domain";

export type UploadPhase = "uploading" | "parsing";

export interface UploadResearchReportOptions {
  endpoint?: string;
  idempotencyKey?: string;
  role?: "THESIS_SOURCE" | "FINANCIAL_FILING" | "SUPPLEMENT";
  projectId?: string;
  onPhase?: (phase: UploadPhase) => void;
  fetchImpl?: typeof fetch;
}

export function createIdempotencyKey(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto?.randomUUID) return `fintrust-${webCrypto.randomUUID()}`;
  if (webCrypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    return `fintrust-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `fintrust-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function uploadResearchReport(
  file: File,
  options: UploadResearchReportOptions = {}
): Promise<UploadReceipt> {
  if (!file || typeof file !== "object") {
    throw new Error("请选择要上传的 PDF 文件");
  }

  const key = options.idempotencyKey || createIdempotencyKey();
  if (key.length < 8 || key.length > 200) {
    throw new Error("上传重试标识无效，请重新上传");
  }

  const body = new FormData();
  body.append("file", file, file.name);
  body.append("role", options.role || "THESIS_SOURCE");
  if (options.projectId) {
    body.append("projectId", options.projectId);
  }
  options.onPhase?.("uploading");

  const request = (options.fetchImpl || fetch)(options.endpoint || "/v1/uploads", {
    method: "POST",
    headers: { "Idempotency-Key": key },
    body,
  });
  const response = await request;
  // The local MVP parses before returning the HTTP receipt. This phase marks
  // the response hand-off while the client decodes the persisted parse result;
  // it is never presented as company identification or thesis analysis.
  options.onPhase?.("parsing");

  let payload: any = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`研报上传失败（HTTP ${response.status}）`);
  }
  if (!response.ok) {
    throw new Error(payload?.error || `研报上传失败（HTTP ${response.status}）`);
  }
  if (!payload?.uploadId || !payload?.document || !payload?.parseSummary) {
    throw new Error("服务器返回的上传回执格式无效");
  }
  return payload as UploadReceipt;
}
