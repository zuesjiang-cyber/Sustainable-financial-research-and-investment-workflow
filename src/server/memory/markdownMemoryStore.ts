import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { ResearchState, UUID, UserCorrection } from "../../shared/domain";

export interface MemoryDocument {
  id: UUID;
  role: string;
  fileName: string;
  sha256: string;
  period: unknown;
  publishedAt: string | null;
}

export interface MemoryHistoryEntry {
  version: string;
  confirmedAt: string;
  state: ResearchState;
  diffSummary: string;
  corrections: UserCorrection[];
}

export interface MarkdownMemoryProject {
  id: UUID;
  company: { name: string; securityCode: string; exchange?: string };
  current_version: string;
  created_at: string;
  updated_at: string;
  documents: MemoryDocument[];
  currentState: ResearchState;
  history: MemoryHistoryEntry[];
  corrections: UserCorrection[];
}

const START = "<!-- FINTRUST_MEMORY_JSON_START -->";
const END = "<!-- FINTRUST_MEMORY_JSON_END -->";

function safeProjectId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function render(project: MarkdownMemoryProject): string {
  const active = project.currentState.items.filter((item) => item.lifecycle === "ACTIVE");
  const questions = project.currentState.questions.filter((question) => question.status === "OPEN");
  const thesisLines = active.length
    ? active.map((item, index) => [
        `### ${index + 1}. ${item.thesis.text}`,
        `- thesisId: \`${item.thesis.thesisId}\``,
        `- revision: ${item.thesis.revision}`,
        `- status: **${item.assessment.status}** / ${item.assessment.maturity}`,
        `- user judgment: ${item.userJudgment || "（未填写）"}`,
        `- summary: ${item.assessment.summary}`,
        `- evidence spans: ${item.assessment.evidenceIds.join(", ") || "（无）"}`,
      ].join("\n")).join("\n\n")
    : "（暂无观点）";
  const documentLines = project.documents.length
    ? project.documents.map((document) => `- ${document.role}: ${document.fileName} (${document.id}) SHA-256=${document.sha256}`).join("\n")
    : "（暂无资料）";
  const questionLines = questions.length
    ? questions.map((question) => `- ${question.text}；所需证据：${question.requiredEvidence}`).join("\n")
    : "（暂无开放问题）";
  const historyLines = project.history.length
    ? project.history.map((entry) => `- ${entry.version} · ${entry.confirmedAt} · ${entry.diffSummary}`).join("\n")
    : "（暂无历史）";

  return [
    "# FinTrust Research Memory",
    "",
    `- projectId: \`${project.id}\``,
    `- company: ${project.company.name} (${project.company.securityCode}${project.company.exchange ? ` · ${project.company.exchange}` : ""})`,
    `- current version: **${project.current_version}**`,
    `- updated at: ${project.updated_at}`,
    "",
    "## Current theses",
    "",
    thesisLines,
    "",
    "## Evidence documents",
    "",
    documentLines,
    "",
    "## Next research questions",
    "",
    questionLines,
    "",
    "## History",
    "",
    historyLines,
    "",
    "## Machine-readable snapshot",
    "",
    START,
    json(project),
    END,
    "",
  ].join("\n");
}

function parse(content: string): MarkdownMemoryProject | null {
  const start = content.indexOf(START);
  const end = content.indexOf(END);
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(content.slice(start + START.length, end).trim()) as MarkdownMemoryProject;
    return value && safeProjectId(value.id) && value.currentState ? value : null;
  } catch {
    return null;
  }
}

/**
 * Small, human-readable persistence for the real MVP. Markdown is the source
 * of truth for the confirmed research memory; the JSON block only makes the
 * same document losslessly reloadable on the next local server start.
 */
export class MarkdownMemoryStore {
  readonly root: string;

  constructor(root = process.env.FINTRUST_MEMORY_DIR || path.resolve("research-memory")) {
    this.root = path.resolve(root);
  }

  private filePath(id: string): string {
    if (!safeProjectId(id)) throw new Error("Invalid research memory project id");
    return path.join(this.root, `${id}.md`);
  }

  async listProjects(): Promise<MarkdownMemoryProject[]> {
    await fs.mkdir(this.root, { recursive: true });
    const names = await fs.readdir(this.root);
    const projects: MarkdownMemoryProject[] = [];
    for (const name of names.filter((item) => item.endsWith(".md"))) {
      try {
        const project = parse(await fs.readFile(path.join(this.root, name), "utf8"));
        if (project) projects.push(project);
      } catch {
        // A malformed memory file is ignored; it must not hide healthy files.
      }
    }
    return projects.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async getProject(id: string): Promise<MarkdownMemoryProject | null> {
    if (!safeProjectId(id)) return null;
    try {
      return parse(await fs.readFile(this.filePath(id), "utf8"));
    } catch {
      return null;
    }
  }

  async saveProject(project: MarkdownMemoryProject): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
    const target = this.filePath(project.id);
    const temporary = `${target}.tmp-${process.pid}-${crypto.randomUUID()}`;
    try {
      await fs.writeFile(temporary, render(project), "utf8");
      await fs.rename(temporary, target);
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async promptContext(id: string): Promise<string> {
    const project = await this.getProject(id);
    if (!project) return "暂无已确认 Research Memory。";
    const current = project.currentState.items
      .filter((item) => item.lifecycle === "ACTIVE")
      .map((item) => `thesisId=${item.thesis.thesisId}; statement=${item.thesis.text}; status=${item.assessment.status}; userJudgment=${item.userJudgment || ""}`)
      .join("\n");
    const questions = project.currentState.questions
      .filter((question) => question.status === "OPEN")
      .map((question) => `- ${question.text} (${question.requiredEvidence})`)
      .join("\n");
    return [
      `公司：${project.company.name}（${project.company.securityCode}）`,
      `当前版本：${project.current_version}`,
      "观点（必须沿用 thesisId）：",
      current || "（无）",
      "用户未决问题：",
      questions || "（无）",
    ].join("\n");
  }
}
