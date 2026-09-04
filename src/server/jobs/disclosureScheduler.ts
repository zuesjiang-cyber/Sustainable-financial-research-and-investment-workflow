import { OfficialFilingProvider } from "../disclosures/officialFilingProvider";
import { JobQueue } from "./queue";
import type { WorkspaceContext } from "../repos/workspaceContext";
import type { UUID, Period } from "../../shared/domain";

export interface MonitorProjectCandidate {
  id: UUID;
  companyName: string;
  securityCode: string;
  exchange: "SSE" | "SZSE";
  latestCoveredPeriod: Period | null;
  lastCheckedAt: Date | null;
}

export class DisclosureScheduler {
  private readonly provider: OfficialFilingProvider;
  private readonly queue: JobQueue;

  constructor(
    provider: OfficialFilingProvider = new OfficialFilingProvider(),
    queue: JobQueue = new JobQueue()
  ) {
    this.provider = provider;
    this.queue = queue;
  }

  async checkProject(
    ctx: WorkspaceContext,
    project: MonitorProjectCandidate
  ): Promise<{ hasNewFiling: boolean; newFilingTitle?: string; checkedAt: string }> {
    const checkedAt = new Date().toISOString();

    // 1. Search disclosures
    const res = await this.provider.searchDisclosures(project.securityCode, project.exchange);

    if (!res.items || res.items.length === 0) {
      return { hasNewFiling: false, checkedAt };
    }

    // 2. Check if latest filing is newer than latestCoveredPeriod
    const latestFiling = res.items[0];
    const coveredEnd = project.latestCoveredPeriod?.end || "2000-01-01";

    const hasNewFiling = latestFiling.period.end > coveredEnd;

    if (hasNewFiling) {
      // 3. Enqueue job for background processing
      await this.queue.enqueue(ctx, {
        kind: "CHECK_DISCLOSURES",
        dedupeKey: `disclosure:${project.id}:${latestFiling.id}`,
        payload: {
          projectId: project.id,
          filingId: latestFiling.id,
          title: latestFiling.title,
          period: latestFiling.period,
          officialUrl: latestFiling.officialUrl,
        },
        priority: 5,
      });

      return {
        hasNewFiling: true,
        newFilingTitle: latestFiling.title,
        checkedAt,
      };
    }

    return {
      hasNewFiling: false,
      checkedAt,
    };
  }
}
