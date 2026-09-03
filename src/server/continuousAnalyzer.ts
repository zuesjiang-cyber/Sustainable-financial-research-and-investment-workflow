import { GoogleGenAI } from "@google/genai";
import type {
  ProjectState,
  ThesisDelta,
  FollowUpQuestion,
  ThesisStatus,
  AnalysisMeta,
} from "../types/fintrust";

export interface ContinuousAnalysisResult {
  version: string;
  material_title: string;
  deltas: ThesisDelta[];
  questions_update: FollowUpQuestion[];
  overall_summary: string;
  analysis_meta: AnalysisMeta;
}

export async function runContinuousAnalysis(
  project: ProjectState,
  newMaterial: {
    title: string;
    content: string;
    snippets?: Array<{ id: string; page: number; text: string }>;
  }
): Promise<ContinuousAnalysisResult> {
  const currentVersion = project.current_version;
  const nextVersion = currentVersion === "T0" ? "T1" : currentVersion === "T1" ? "T2" : `T${parseInt(currentVersion.replace("T", "") || "1") + 1}`;
  const startTime = Date.now();

  const apiKey = process.env.GEMINI_API_KEY;
  const snippets = newMaterial.snippets || [];
  const textContent = newMaterial.content;

  // Check if LLM is available
  if (apiKey && apiKey.trim().length > 5) {
    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `你是一名严格、客观的买方资深半导体/金融行业研究员。正在进行【${project.company}】的持续研究跟踪（版本由 ${currentVersion} 推进至 ${nextVersion}）。

【已有研究状态（截至 ${currentVersion}）】：
公司：${project.company} (${project.ticker})
现有核心观点与追踪阈值：
${project.theses.map((t) => `- [${t.id}] ${t.title}: 当前评级=${t.current_status}；原观点=${t.original_view}；验证标准=${t.verification_criteria}`).join("\n")}

历史遗留未解决疑问：
${project.open_questions.map((q) => `- [${q.id}] 状态=${q.status}: ${q.question_text} (上次笔记: ${q.answer_notes || "无"})`).join("\n")}

【本轮增量材料 (${nextVersion})】：
材料名称：《${newMaterial.title}》
材料内容：
${textContent}

【分析硬约束】：
1. 这是持续跟踪，不是从零开始重新写公司概况！请直接针对已有观点评估最新材料支持/削弱程度。
2. 严禁把未披露视为反向证据，严禁把券商预测当做已实现业绩。
3. 若本轮材料主要为定性运营材料或季度简报，缺少全套财务数据，绝对不要报错或拒绝分析，应当依托定性进展（如料号认证、良率、产能交付）推进定性观点！
4. 必须逐项给出 Gap 归因：观察到什么 (observed)、材料给出什么解释 (disclosed_reason)、尚待验证的可能原因 (unverified_hypotheses)。
5. 必须对照已有疑问：回答哪些疑问被解决、哪些仍未解决、新增什么新疑问。

请以纯 JSON 格式输出，不要有 Markdown 代码块前缀或包裹，JSON 结构如下：
{
  "deltas": [
    {
      "thesis_id": "THESIS_01",
      "new_status": "支持" | "部分支持" | "保持" | "削弱" | "不足以判断",
      "reason": "简明结论",
      "gap_explanation": {
        "observed": "...",
        "disclosed_reason": "...",
        "unverified_hypotheses": "..."
      },
      "evidence_ids": ["..."],
      "next_steps": "..."
    }
  ],
  "questions_update": [
    {
      "id": "Q01",
      "question_text": "...",
      "status": "已解决" | "部分解决" | "未解决",
      "answer_notes": "基于本轮材料的回答依据"
    }
  ],
  "new_questions": [
    {
      "id": "Q03",
      "question_text": "本轮新涌现的待核实疑问"
    }
  ],
  "overall_summary": "本轮增量更新的买方核心结论"
}`;

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: prompt,
      });

      const responseText = response.text || "";
      const latency = Date.now() - startTime;

      // Clean JSON string
      const cleanJson = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);

      // Map deltas
      const deltas: ThesisDelta[] = (parsed.deltas || []).map((d: any) => {
        const thesis = project.theses.find((t) => t.id === d.thesis_id);
        return {
          thesis_id: d.thesis_id,
          title: thesis ? thesis.title : d.thesis_id,
          previous_status: thesis ? thesis.current_status : "待评估",
          new_status: (d.new_status as ThesisStatus) || "保持",
          reason: d.reason || "",
          gap_explanation: {
            observed: d.gap_explanation?.observed || "",
            disclosed_reason: d.gap_explanation?.disclosed_reason || "",
            unverified_hypotheses: d.gap_explanation?.unverified_hypotheses || "",
          },
          evidence_ids: d.evidence_ids || (snippets.length > 0 ? [snippets[0].id] : []),
          next_steps: d.next_steps || "持续跟踪",
        };
      });

      // Map questions
      const updatedQuestions: FollowUpQuestion[] = [];
      const now = new Date().toISOString();

      // Process existing question updates
      for (const q of project.open_questions) {
        const found = (parsed.questions_update || []).find((u: any) => u.id === q.id);
        if (found) {
          updatedQuestions.push({
            ...q,
            status: found.status || q.status,
            resolved_in_version: found.status === "已解决" ? nextVersion : q.resolved_in_version,
            answer_notes: found.answer_notes || q.answer_notes,
            updated_at: now,
          });
        } else {
          updatedQuestions.push(q);
        }
      }

      // Add new questions
      if (parsed.new_questions) {
        for (const nq of parsed.new_questions) {
          updatedQuestions.push({
            id: nq.id || `Q${String(updatedQuestions.length + 1).padStart(2, "0")}`,
            question_text: nq.question_text,
            status: "未解决",
            created_in_version: nextVersion,
            resolved_in_version: null,
            answer_notes: "",
            updated_at: now,
          });
        }
      }

      return {
        version: nextVersion,
        material_title: newMaterial.title,
        deltas,
        questions_update: updatedQuestions,
        overall_summary: parsed.overall_summary || `${nextVersion} 轮观点更新完成。`,
        analysis_meta: {
          model_name: "gemini-3.8-flash",
          llm_calls: 1,
          latency_ms: latency,
          retry_count: 0,
          execution_mode: "real_gemini",
        },
      };
    } catch (err: any) {
      console.warn("Real Gemini call encountered error, falling back to deterministic continuous rules:", err);
      return runDeterministicContinuousAnalysis(project, newMaterial, nextVersion, startTime, String(err?.message || err));
    }
  }

  // Fallback to pure deterministic evaluation if no API key is set
  return runDeterministicContinuousAnalysis(project, newMaterial, nextVersion, startTime);
}

function runDeterministicContinuousAnalysis(
  project: ProjectState,
  newMaterial: {
    title: string;
    content: string;
    snippets?: Array<{ id: string; page: number; text: string }>;
  },
  nextVersion: string,
  startTime: number,
  fallbackReason?: string
): ContinuousAnalysisResult {
  const text = newMaterial.content || "";
  const snippets = newMaterial.snippets || [];
  const deltas: ThesisDelta[] = [];
  const now = new Date().toISOString();

  // Split text into readable sentences for semantic grounding
  const sentences = text
    .split(/[\n。；;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);

  // Positive and negative indicators for financial / research momentum
  const positiveWords = ["增长", "提升", "突破", "增加", "改善", "超预期", "放量", "投产", "认证", "中标", "好转", "企稳", "消化", "回升", "达标", "出货", "规模化"];
  const negativeWords = ["下滑", "承压", "减少", "延期", "降价", "恶化", "亏损", "违约", "收窄", "下行", "放缓", "受阻", "阻力", "未达预期"];

  // 1. Evaluate each thesis dynamically
  for (const thesis of project.theses) {
    // Extract keywords from thesis title and verification criteria
    const titleKeywords = thesis.title.split(/[\s（）()、·/_-]+/).filter((k) => k.length >= 2);
    const criteriaKeywords = (thesis.verification_criteria || "").split(/[\s（）()、·/_,>=<+%-]+/).filter((k) => k.length >= 2);
    const allKeywords = Array.from(new Set([...titleKeywords, ...criteriaKeywords]));

    // Find candidate matching sentences in the new material
    const matchedSentences = sentences.filter((sent) =>
      allKeywords.some((kw) => sent.includes(kw))
    );

    let newStatus: ThesisStatus = thesis.current_status;
    let reason = "";
    let observed = "";
    let disclosed = "";
    let unverified = "";
    const matchedEvidenceIds: string[] = [];

    if (matchedSentences.length > 0) {
      const topSentence = matchedSentences[0];
      const allMatchedText = matchedSentences.slice(0, 2).join("；");

      const posCount = positiveWords.filter((w) => allMatchedText.includes(w)).length;
      const negCount = negativeWords.filter((w) => allMatchedText.includes(w)).length;

      // Match snippets if available
      const relatedSnippet = snippets.find((s) => allKeywords.some((kw) => s.text.includes(kw)));
      if (relatedSnippet) {
        matchedEvidenceIds.push(relatedSnippet.id);
      }

      if (posCount > negCount && posCount > 0) {
        newStatus = posCount >= 2 ? "支持" : "部分支持";
        reason = `材料给出支持线索：${topSentence}。关键业务进展符合或接近预期门槛。`;
        observed = topSentence;
        disclosed = `材料披露表明：${matchedSentences.slice(0, 2).join("；")}`;
        unverified = `后续全财年财务指标的量化结算与持续性（门槛：${thesis.verification_criteria || "持续跟踪"}）。`;
      } else if (negCount > posCount && negCount > 0) {
        newStatus = "削弱";
        reason = `材料提示承压线索：${topSentence}。相关变量表现不及预期。`;
        observed = topSentence;
        disclosed = `官方说明业务受到扰动：${topSentence}`;
        unverified = `负面影响的持续周期及是否会导致核心投资逻辑永久性破坏。`;
      } else {
        newStatus = "保持";
        reason = `材料提及相关进展（${topSentence.slice(0, 45)}...），但整体表现处于稳态区间。`;
        observed = topSentence;
        disclosed = `材料陈述：${topSentence}`;
        unverified = `需结合后续财务结算数据进一步验证。`;
      }
    } else {
      // No direct sentences matched
      newStatus = "不足以判断";
      reason = `本轮增量材料未对【${thesis.title}】提供直接核验信息，保持前期研判。`;
      observed = "本轮材料未检索到直接对应的事实陈述段落。";
      disclosed = "材料重点披露其他维度的运营或业务动态。";
      unverified = `需在后续专项披露或定期财报中核验【${thesis.verification_criteria || thesis.title}】。`;
    }

    deltas.push({
      thesis_id: thesis.id,
      title: thesis.title,
      previous_status: thesis.current_status,
      new_status: newStatus,
      reason,
      gap_explanation: {
        observed,
        disclosed_reason: disclosed,
        unverified_hypotheses: unverified,
      },
      evidence_ids: matchedEvidenceIds.length > 0 ? matchedEvidenceIds : (snippets.length > 0 ? [snippets[0].id] : []),
      next_steps: `对照验证门槛（${thesis.verification_criteria || "未设定"}）持续核验。`,
    });
  }

  // 2. Evaluate questions dynamically
  const updatedQuestions: FollowUpQuestion[] = [];
  for (const q of project.open_questions) {
    const qKeywords = q.question_text.split(/[\s，,。？?（）()、·/_-]+/).filter((k) => k.length >= 2);
    const matchedSentences = sentences.filter((sent) =>
      qKeywords.some((kw) => sent.includes(kw))
    );

    if (matchedSentences.length > 0) {
      const evidenceText = matchedSentences.slice(0, 2).join("；");
      const isComprehensive = matchedSentences.length >= 2 || evidenceText.length > 50;
      const status = isComprehensive ? "已解决" : "部分解决";
      updatedQuestions.push({
        ...q,
        status,
        resolved_in_version: status === "已解决" ? nextVersion : q.resolved_in_version,
        answer_notes: `【${nextVersion} 材料核验】：${evidenceText}。`,
        updated_at: now,
      });
    } else {
      updatedQuestions.push(q);
    }
  }

  // 3. Dynamically discover new questions from uncertainty sentences in the text
  const riskSentences = sentences.filter((s) =>
    ["风险", "挑战", "不确定性", "待观察", "取决于", "延后", "爬坡", "波动"].some((w) => s.includes(w))
  );

  if (riskSentences.length > 0) {
    const newQText = `基于本轮材料披露：“${riskSentences[0].slice(0, 60)}...”，后续将如何影响业务兑现节奏？`;
    const nextQId = `Q${String(updatedQuestions.length + 1).padStart(2, "0")}`;
    if (!updatedQuestions.some((q) => q.question_text === newQText)) {
      updatedQuestions.push({
        id: nextQId,
        question_text: newQText,
        status: "未解决",
        created_in_version: nextVersion,
        resolved_in_version: null,
        answer_notes: "",
        updated_at: now,
      });
    }
  }

  const latency = Date.now() - startTime;

  return {
    version: nextVersion,
    material_title: newMaterial.title,
    deltas,
    questions_update: updatedQuestions,
    overall_summary: `【${nextVersion} 连续观点更新完成】基于本轮材料《${newMaterial.title}》，已完成 ${deltas.length} 项核心观点的增量比对与 ${updatedQuestions.length} 项疑问跟踪，已生成 3 段式 Gap 事实归因。`,
    analysis_meta: {
      model_name: "FinTrust Semantic Rules Engine (Offline Verified Mode)",
      llm_calls: 0,
      latency_ms: latency,
      retry_count: 0,
      execution_mode: fallbackReason ? "degraded_error" : "offline_math_only",
      error_message: fallbackReason,
    },
  };
}
