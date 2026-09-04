import crypto from "node:crypto";
import { JobQueue, JobRow, JobKind } from "./queue";

export type JobHandler = (
  job: JobRow,
  heartbeat: () => Promise<boolean>
) => Promise<void>;

export class ResearchWorker {
  private readonly queue: JobQueue;
  private readonly workerId: string;
  private readonly handlers: Map<JobKind, JobHandler> = new Map();
  private isRunning: boolean = false;
  private loopPromise: Promise<void> | null = null;
  private reapInterval: NodeJS.Timeout | null = null;

  constructor(
    queue: JobQueue = new JobQueue(),
    workerId: string = `worker-${crypto.randomUUID().slice(0, 8)}`
  ) {
    this.queue = queue;
    this.workerId = workerId;
  }

  registerHandler(kind: JobKind, handler: JobHandler): this {
    this.handlers.set(kind, handler);
    return this;
  }

  start(pollIntervalMs: number = 1000): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Reap expired leases every 30s
    this.reapInterval = setInterval(() => {
      this.queue.reapExpiredLeases().catch((err) => {
        console.error("[Worker] Error reaping expired leases:", err);
      });
    }, 30000);

    this.loopPromise = this.runLoop(pollIntervalMs);
    console.log(`[Worker ${this.workerId}] Started.`);
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.reapInterval) {
      clearInterval(this.reapInterval);
      this.reapInterval = null;
    }

    if (this.loopPromise) {
      await this.loopPromise;
      this.loopPromise = null;
    }
    console.log(`[Worker ${this.workerId}] Stopped gracefully.`);
  }

  private async runLoop(pollIntervalMs: number): Promise<void> {
    while (this.isRunning) {
      try {
        const claimed = await this.queue.claimNext(this.workerId, 90);
        if (!claimed) {
          await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
          continue;
        }

        const { job, leaseToken } = claimed;
        const handler = this.handlers.get(job.kind);

        if (!handler) {
          console.warn(`[Worker] No handler registered for job kind: ${job.kind}`);
          await this.queue.fail(job.id, leaseToken, new Error(`No handler for kind ${job.kind}`));
          continue;
        }

        const heartbeat = () => this.queue.heartbeat(job.id, leaseToken, 90);

        try {
          await handler(job, heartbeat);
          await this.queue.complete(job.id, leaseToken);
        } catch (jobErr) {
          console.error(`[Worker] Job ${job.id} failed:`, jobErr);
          await this.queue.fail(job.id, leaseToken, jobErr);
        }
      } catch (loopErr) {
        console.error("[Worker Loop Error]:", loopErr);
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }
  }
}
