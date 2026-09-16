import type { V2Project } from "../../shared/v2Domain";
import { DEFAULT_MONITORING } from "../../shared/v2Domain";
import type { V2Store } from "./v2Store";
import { makeReplayPacks, type ReplayPack } from "./replayData";

export class ReplayService {
  constructor(private readonly store: V2Store) {}

  list(): ReplayPack[] {
    return makeReplayPacks();
  }

  async start(packId: string): Promise<V2Project> {
    const pack = makeReplayPacks().find((item) => item.id === packId);
    if (!pack) throw Object.assign(new Error("回放案例不存在"), { statusCode: 404 });
    const project = this.store.emptyProject({
      id: pack.projectId,
      title: `${pack.company.name} 历史事件回放`,
      company: pack.company,
      identityStatus: "IDENTIFIED",
      isReplay: true,
      replayAsOf: pack.asOf,
      summary: pack.summary,
      monitoring: { ...DEFAULT_MONITORING, enabled: false },
      evidence: pack.evidence,
      events: pack.events,
      analyses: pack.analyses,
      currentStance: pack.stance,
      stanceHistory: pack.stance ? [pack.stance] : [],
    });
    await this.store.saveProject(project);
    return project;
  }
}
