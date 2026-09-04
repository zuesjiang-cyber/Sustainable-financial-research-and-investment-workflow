import crypto from "node:crypto";
import { DraftsRepo } from "../repos/draftsRepo";
import { ProjectsRepo } from "../repos/projectsRepo";
import type { WorkspaceContext } from "../repos/workspaceContext";
import type {
  Draft,
  DraftItem,
  ResearchState,
  UserCorrection,
  SourceManifest,
  UUID,
} from "../../shared/domain";
import { DraftSchema, ResearchStateSchema } from "../../shared/domain";

export class StateManager {
  private readonly draftsRepo: DraftsRepo;
  private readonly projectsRepo: ProjectsRepo;

  constructor(
    draftsRepo: DraftsRepo = new DraftsRepo(),
    projectsRepo: ProjectsRepo = new ProjectsRepo()
  ) {
    this.draftsRepo = draftsRepo;
    this.projectsRepo = projectsRepo;
  }

  buildDraftObject(params: {
    id?: UUID;
    runId: UUID;
    projectId: UUID;
    baseStateVersion: number;
    items: DraftItem[];
    sourceManifest: SourceManifest;
    corrections?: UserCorrection[];
  }): Draft {
    const draft: Draft = {
      schemaVersion: "1.0",
      id: params.id || crypto.randomUUID(),
      runId: params.runId,
      projectId: params.projectId,
      revision: 1,
      baseStateVersion: params.baseStateVersion,
      sourceManifest: params.sourceManifest,
      items: params.items,
      staleThesisIds: [],
      questions: [],
      corrections: params.corrections || [],
      method: {
        version: 1,
        focusMetrics: [],
        aliases: {},
        focusQuestions: [],
        preferences: [],
      },
    };

    return DraftSchema.parse(draft);
  }

  buildStateSnapshotFromDraft(
    draft: Draft,
    nextVersion: number,
    updateId: UUID
  ): ResearchState {
    const state: ResearchState = {
      schemaVersion: "1.0",
      projectId: draft.projectId,
      version: nextVersion,
      updateId,
      confirmedAt: new Date().toISOString(),
      items: draft.items.filter((item) => item.include).map((item) => ({
        thesis: item.thesis,
        lifecycle: "ACTIVE",
        assessment: item.proposed,
        userJudgment: item.userJudgment || null,
      })),
      questions: draft.questions,
      method: draft.method,
      sourceManifest: draft.sourceManifest,
    };

    return ResearchStateSchema.parse(state);
  }
}
