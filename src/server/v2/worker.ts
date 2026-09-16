import { SqliteJobQueue } from "./jobQueue";
import type { ResearchEngine } from "./researchEngine";
import type { V2Store } from "./v2Store";

export class V2Worker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly owner = `v2-worker-${process.pid}`;

  constructor(
    private readonly queue: SqliteJobQueue,
    private readonly engine: ResearchEngine,
    private readonly store: V2Store,
  ) {}

  start(intervalMs = 750): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((error) => console.error("[v2-worker]", error));
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.queue.reapExpired();
      const job = await this.queue.claimNext(this.owner);
      if (!job) return;
      try {
        if (job.kind === "BACKGROUND" || job.kind === "DEEP" || job.kind === "MONITOR_OFFICIAL" || job.kind === "MONITOR_EXTERNAL") {
          const runId = String(job.payload.runId || "");
          if (runId) await this.engine.runBackground(runId, job.kind === "DEEP" ? "DEEP" : job.kind === "MONITOR_EXTERNAL" ? "MONITOR_EXTERNAL" : job.kind === "MONITOR_OFFICIAL" ? "MONITOR_OFFICIAL" : "BACKGROUND");
        }
        await this.queue.complete(job.id);
      } catch (error) {
        await this.queue.fail(job.id, error);
        const runId = String(job.payload.runId || "");
        if (runId) {
          const run = await this.store.getRun(runId);
          if (run) {
            run.status = "FAILED";
            run.error = error instanceof Error ? error.message : String(error);
            await this.store.saveRun(run);
          }
        }
      }
    } finally {
      this.running = false;
    }
  }
}
