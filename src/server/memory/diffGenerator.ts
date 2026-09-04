import type {
  ResearchState,
  DraftItem,
  ThesisAssessment,
  ThesisRevision,
  ResearchQuestion,
  UUID,
} from "../../shared/domain";

export class DiffGenerator {
  generateDraftItems(
    theses: ThesisRevision[],
    newAssessments: Map<UUID, ThesisAssessment>,
    previousState: ResearchState | null
  ): DraftItem[] {
    const draftItems: DraftItem[] = [];

    for (const thesis of theses) {
      const proposed = newAssessments.get(thesis.thesisId);
      if (!proposed) continue;

      const prevItem = previousState?.items.find((i) => i.thesis.thesisId === thesis.thesisId);
      const previous = prevItem?.assessment || null;
      const userJudgment = prevItem?.userJudgment || null;

      if (!previous) {
        draftItems.push({
          thesis,
          previous: null,
          proposed,
          change: "NEW",
          changeReason: "研报新录入投资观点",
          include: true,
          userJudgment,
        });
        continue;
      }

      // Compare status, maturity, and gap
      const statusChanged = previous.status !== proposed.status;
      const maturityChanged = previous.maturity !== proposed.maturity;
      const gapChanged = previous.observedGap?.text !== proposed.observedGap?.text;

      let change: "CHANGED" | "UNCHANGED" = "UNCHANGED";
      let changeReason = "观点状态与核验事实维持上一轮结论";

      if (statusChanged || maturityChanged) {
        change = "CHANGED";
        changeReason = `核验结论演进：${previous.status} (${previous.maturity}) → ${proposed.status} (${proposed.maturity})`;
      } else if (gapChanged) {
        change = "CHANGED";
        changeReason = "最新财报更新了核验事实与差额，但结论状态保持不变";
      }

      draftItems.push({
        thesis,
        previous,
        proposed,
        change,
        changeReason,
        include: true,
        userJudgment,
      });
    }

    return draftItems;
  }

  resolveQuestions(
    openQuestions: ResearchQuestion[],
    newAssessments: Map<UUID, ThesisAssessment>
  ): ResearchQuestion[] {
    return openQuestions.map((q) => {
      const assessment = newAssessments.get(q.thesisId);
      if (assessment && assessment.maturity === "DUE" && assessment.observedGap) {
        // If the thesis matured and has verified gap evidence, question can be answered
        return {
          ...q,
          status: "ANSWERED",
          answer: {
            text: `最新正式财报已发布：${assessment.summary}`,
            evidenceIds: assessment.evidenceIds,
            factIds: assessment.factIds,
            calculationIds: assessment.calculationIds,
          },
        };
      }
      return q;
    });
  }
}
