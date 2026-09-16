import type { V2Project } from "../../shared/v2Domain";
import { BACKGROUND_LIMITS } from "../../shared/v2Domain";
import type { SqliteJobQueue } from "./jobQueue";
import type { V2Store } from "./v2Store";

export class MonitorScheduler {
  constructor(
    private readonly store: V2Store,
    private readonly queue: SqliteJobQueue,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  due(last: string | null, intervalMs: number, now: Date): boolean {
    if (!last) return true;
    const then = Date.parse(last);
    if (!Number.isFinite(then)) return true;
    return now.getTime() - then >= intervalMs;
  }

  async scheduleDueProjects(): Promise<number> {
    const now = this.clock();
    const projects = (await this.store.listProjects(false)).filter((project) => project.monitoring.enabled && project.identityStatus === "IDENTIFIED" && !project.isReplay);
    let enqueued = 0;
    for (const project of projects.slice(0, 5)) {
      const officialMs = project.monitoring.officialEveryMinutes * 60_000;
      const externalMs = project.monitoring.externalEveryHours * 3600_000;
      if (this.due(project.monitoring.lastOfficialCheckAt, officialMs, now)) {
        await this.enqueueMonitor(project, "MONITOR_OFFICIAL");
        enqueued += 1;
      }
      if (this.due(project.monitoring.lastExternalCheckAt, externalMs, now)) {
        await this.enqueueMonitor(project, "MONITOR_EXTERNAL");
        enqueued += 1;
      }
      for (const lead of project.leads.filter((item) => item.status === "OPEN")) {
        if (Date.parse(lead.nextCheckAt) <= now.getTime()) {
          await this.enqueueMonitor(project, "MONITOR_EXTERNAL", lead.id);
          enqueued += 1;
        }
      }
    }
    return enqueued;
  }

  private async enqueueMonitor(project: V2Project, kind: "MONITOR_OFFICIAL" | "MONITOR_EXTERNAL", leadId?: string): Promise<void> {
    const createdAt = this.clock().toISOString();
    const run = {
      id: cryptoRandom(),
      projectId: project.id,
      kind: "MONITOR" as const,
      status: "QUEUED" as const,
      parentRunId: null,
      idempotencyKey: null,
      input: { text: "", url: null, documentId: null, question: leadId || null },
      preliminary: null,
      modelCalls: 0,
      documentsRead: 0,
      limits: { ...BACKGROUND_LIMITS },
      coverage: { official: "NOT_STARTED" as const, external: "NOT_STARTED" as const, notes: [] as string[] },
      error: null,
      createdAt,
      updatedAt: createdAt,
      completedAt: null,
      events: [{ seq: 1, at: createdAt, phase: "queued", message: "后台检查已排队（含停机后补查）" }],
      resultSummary: null,
    };
    await this.store.saveRun(run);
    await this.queue.enqueue({
      kind,
      dedupeKey: `${kind}:${project.id}:${leadId || run.id.slice(0, 8)}:${createdAt.slice(0, 13)}`,
      payload: { runId: run.id, projectId: project.id, leadId },
    });
  }
}

function cryptoRandom(): string {
  return globalThis.crypto.randomUUID();
}
