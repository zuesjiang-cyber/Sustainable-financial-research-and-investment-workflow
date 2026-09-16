import type { V2Project } from "../../shared/v2Domain";
import { DEFAULT_MONITORING } from "../../shared/v2Domain";
import { MarkdownMemoryStore } from "../memory/markdownMemoryStore";
import { getAllProjects, getProjectById } from "../projectRepo";
import type { V2Store } from "./v2Store";
import { classifyUserInput, createStanceVersion } from "./stance";

export async function importLegacyProjects(store: V2Store): Promise<{ imported: number; notes: string[] }> {
  const notes: string[] = [];
  let imported = 0;
  const memory = new MarkdownMemoryStore();
  const markdownProjects = await memory.listProjects().catch(() => []);
  for (const item of markdownProjects) {
    if (await store.getProject(item.id)) {
      notes.push(`${item.id} 已存在，保留双方版本，不猜测合并`);
      continue;
    }
    const project = store.emptyProject({
      id: item.id,
      title: `${item.company.name} 历史导入`,
      company: { name: item.company.name, securityCode: item.company.securityCode, exchange: item.company.exchange === "SSE" ? "SSE" : "SZSE" },
      identityStatus: "IDENTIFIED",
      summary: "从 Markdown Research Memory 导入。归属不明确的旧观点标为历史记录，不推断为用户认可。",
      monitoring: { ...DEFAULT_MONITORING, enabled: false },
    });
    for (const thesis of item.currentState.items) {
      const text = thesis.userJudgment || "";
      const classification = classifyUserInput(text);
      if (classification.endorsed && text) {
        const stance = createStanceVersion({ rawText: text, classification, previous: project.currentStance, now: item.updated_at, changeReason: "历史导入中的明确用户判断" });
        if (stance) {
          project.currentStance = stance;
          project.stanceHistory.push(stance);
        }
      } else {
        project.materialViews.push({
          id: thesis.thesis.thesisId,
          author: "历史研报/系统提取",
          sourceEvidenceId: thesis.thesis.sourceEvidenceIds[0] || thesis.thesis.thesisId,
          text: thesis.thesis.text,
          publishedAt: null,
          observationScope: "旧数据归属不明确，仅作历史记录",
          endorsedByUser: false,
        });
      }
    }
    await store.saveProject(project);
    imported += 1;
  }

  const sqliteList = await getAllProjects().catch(() => []);
  for (const row of sqliteList) {
    if (await store.getProject(row.id)) continue;
    const full = await getProjectById(row.id);
    if (!full) continue;
    const project = store.emptyProject({
      id: full.id,
      title: full.name,
      company: full.ticker ? { name: full.company, securityCode: full.ticker, exchange: full.ticker.startsWith("6") ? "SSE" : "SZSE" } : null,
      identityStatus: full.ticker ? "IDENTIFIED" : "UNKNOWN",
      summary: "从旧 SQLite 项目导入，任务信息保留为历史。",
      monitoring: { ...DEFAULT_MONITORING, enabled: false },
    });
    notes.push(`导入旧项目 ${full.id}，冲突时保留双方版本`);
    await store.saveProject(project);
    imported += 1;
  }
  return { imported, notes };
}
