import type {
  ResearchState,
  UserCorrection,
  ThesisRevision,
  ResearchQuestion,
  UUID,
} from "../../shared/domain";

export interface CompiledResearchContext {
  projectId: UUID;
  baseStateVersion: number;
  activeCorrections: UserCorrection[];
  thesesToAssess: ThesisRevision[];
  previousAssessments: Map<UUID, any>;
  openQuestions: ResearchQuestion[];
  contextHash: string;
}

export class ContextCompiler {
  compileContext(
    projectId: UUID,
    previousState: ResearchState | null,
    activeCorrections: UserCorrection[] = []
  ): CompiledResearchContext {
    if (!previousState) {
      return {
        projectId,
        baseStateVersion: 0,
        activeCorrections: [],
        thesesToAssess: [],
        previousAssessments: new Map(),
        openQuestions: [],
        contextHash: "empty-t0",
      };
    }

    const baseStateVersion = previousState.version;
    const previousAssessments = new Map<UUID, any>();
    const thesesToAssess: ThesisRevision[] = [];

    // Map active theses, applying user corrections if any
    for (const item of previousState.items) {
      if (item.lifecycle === "ARCHIVED") continue;

      let thesis = { ...item.thesis };

      // Check if user modified thesis text or criterion
      const textCorrection = activeCorrections.find(
        (c) => c.thesisId === thesis.thesisId && c.type === "THESIS_TEXT" && c.action === "SET"
      );
      if (textCorrection && typeof textCorrection.after === "string") {
        thesis.text = textCorrection.after;
      }

      const critCorrection = activeCorrections.find(
        (c) => c.thesisId === thesis.thesisId && c.type === "CRITERION" && c.action === "SET"
      );
      if (critCorrection && critCorrection.after) {
        thesis.criterion = critCorrection.after as any;
      }

      thesesToAssess.push(thesis);
      previousAssessments.set(thesis.thesisId, {
        assessment: item.assessment,
        userJudgment: item.userJudgment,
      });
    }

    // Retain open questions
    const openQuestions = previousState.questions.filter((q) => q.status === "OPEN");

    const contextHash = `ctx-v${baseStateVersion}-${thesesToAssess.length}-${openQuestions.length}`;

    return {
      projectId,
      baseStateVersion,
      activeCorrections,
      thesesToAssess,
      previousAssessments,
      openQuestions,
      contextHash,
    };
  }
}
