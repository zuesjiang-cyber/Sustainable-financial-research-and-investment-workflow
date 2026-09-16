import fs from "node:fs/promises";
import path from "node:path";
import type { V2Project } from "../../shared/v2Domain";

export function renderProjectMarkdown(project: V2Project): string {
  const stance = project.currentStance
    ? [
        `## 用户立场 v${project.currentStance.version}`,
        "",
        project.currentStance.rawText,
        "",
        `- 概括：${project.currentStance.summary}`,
        `- 修改理由：${project.currentStance.changeReason || "（无）"}`,
        `- 用户阈值：${project.currentStance.thresholds.map((item) => `${item.metric} ${item.op} ${item.value}`).join("；") || "（用户未定义，保持为空）"}`,
      ].join("\n")
    : "## 用户立场\n\n（无。材料观点不等于用户认可。）";
  const events = project.events.map((event) => `- [${event.verification}] ${event.stage} ${event.description} · 发生 ${event.occurredAt || "未知"} · 披露 ${event.disclosedAt || "未知"}`).join("\n") || "（无）";
  const leads = project.leads.filter((item) => item.status === "OPEN").map((item) => `- ${item.text}`).join("\n") || "（无）";
  return [
    `# ${project.title}`,
    "",
    `> 本文件由 SQLite 运行状态导出，可重新生成，不是运行依据。`,
    "",
    `- projectId: \`${project.id}\``,
    `- 公司：${project.company ? `${project.company.name} ${project.company.securityCode}` : "未确认"}`,
    `- 更新：${project.updatedAt}`,
    "",
    stance,
    "",
    "## 已核实 / 待核实事件",
    "",
    events,
    "",
    "## 未核实线索",
    "",
    leads,
    "",
  ].join("\n");
}

export async function exportProjectMarkdown(project: V2Project, root = process.env.FINTRUST_MEMORY_DIR || "research-memory"): Promise<string> {
  const dir = path.resolve(root);
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, `v2-${project.id}.md`);
  await fs.writeFile(target, renderProjectMarkdown(project), "utf8");
  return target;
}
