import type { ResearchState, EvidenceSpan, SourceDocument } from "../../shared/domain";

export interface ExportBundle {
  markdown: string;
  stateJson: string;
  manifestJson: string;
  exportTime: string;
}

export class ResearchExporter {
  exportResearchState(
    state: ResearchState,
    companyName: string = "圣邦股份",
    securityCode: string = "300661"
  ): ExportBundle {
    const exportTime = new Date().toISOString();

    const mdLines: string[] = [];
    mdLines.push(`# FinTrust 研报观点核验与持续研究报告`);
    mdLines.push(`**标的：** ${companyName} (${securityCode})`);
    mdLines.push(`**研究版本：** v${state.version}`);
    mdLines.push(`**核验确认时点：** ${state.confirmedAt}`);
    mdLines.push(`**财报数据截点：** ${state.sourceManifest.asOf}`);
    mdLines.push(`---`);
    mdLines.push(``);
    mdLines.push(`## 核心观点逐条核验结论`);
    mdLines.push(``);

    state.items.forEach((item, idx) => {
      const t = item.thesis;
      const a = item.assessment;

      mdLines.push(`### ${idx + 1}. ${t.text}`);
      mdLines.push(`- **原研报原句：** "${t.originalText}"`);
      mdLines.push(`- **核验结论：** **${a.status}** (期限进度: ${a.maturity}, 阶段信号: ${a.interimSignal})`);
      mdLines.push(`- **事实陈述：** ${a.summary}`);
      if (a.observedGap) {
        mdLines.push(`- **差额观察：** ${a.observedGap.text}`);
      }
      if (a.disclosedCauses.length > 0) {
        mdLines.push(`- **公司披露原因：** ${a.disclosedCauses[0].text}`);
      }
      if (a.hypotheses.length > 0) {
        mdLines.push(`- **系统假说与风险：** ${a.hypotheses[0].text}`);
      }
      if (item.userJudgment) {
        mdLines.push(`- **分析师独立研判：** *${item.userJudgment}*`);
      }
      mdLines.push(``);
    });

    if (state.questions.length > 0) {
      mdLines.push(`## 重点跟踪问题与闭环进展`);
      mdLines.push(``);
      state.questions.forEach((q, idx) => {
        mdLines.push(`- **Q${idx + 1} [${q.status}]:** ${q.text}`);
        if (q.answer) {
          mdLines.push(`  - **解答事实：** ${q.answer.text}`);
        }
      });
      mdLines.push(``);
    }

    mdLines.push(`## 溯源资料清单`);
    state.sourceManifest.documents.forEach((doc) => {
      mdLines.push(`- 文档 ID: \`${doc.documentId}\` · 用途: ${doc.purpose} · SHA256: \`${doc.sha256.slice(0, 16)}...\``);
    });

    const markdown = mdLines.join("\n");
    const stateJson = JSON.stringify(state, null, 2);
    const manifestJson = JSON.stringify(state.sourceManifest, null, 2);

    return {
      markdown,
      stateJson,
      manifestJson,
      exportTime,
    };
  }
}
