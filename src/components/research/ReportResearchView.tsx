import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Edit3,
  FileText,
  HelpCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  XCircle,
} from "lucide-react";
import type { Draft } from "../../shared/domain";

interface ReportResearchViewProps {
  draft: Draft;
  companyName?: string;
  securityCode?: string;
  onUpdateRound2: () => void;
  onConfirmDraft: (
    userJudgments: Record<string, string>,
    edits?: Array<{ thesisId: string; text?: string; criterion?: unknown }>,
    questions?: Array<{ id?: string; thesisId: string; text: string; requiredEvidence: string; status?: string }>,
  ) => void;
  isUpdatingRound2?: boolean;
  isConfirmed?: boolean;
  confirmedVersion?: number;
  isReadOnly?: boolean;
}

export const ReportResearchView: React.FC<ReportResearchViewProps> = ({
  draft,
  companyName = "当前公司",
  securityCode = "未确认",
  onUpdateRound2,
  onConfirmDraft,
  isUpdatingRound2 = false,
  isConfirmed = false,
  confirmedVersion = 1,
  isReadOnly = false,
}) => {
  const [userJudgments, setUserJudgments] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const item of draft.items) if (item.userJudgment) initial[item.thesis.thesisId] = item.userJudgment;
    return initial;
  });
  const [thesisTexts, setThesisTexts] = useState<Record<string, string>>(() => Object.fromEntries(draft.items.map((item) => [item.thesis.thesisId, item.thesis.text])));
  const [questionTexts, setQuestionTexts] = useState<Record<string, string>>(() => Object.fromEntries(draft.questions.map((question) => [question.id, question.text])));

  useEffect(() => {
    setUserJudgments(Object.fromEntries(draft.items.filter((item) => item.userJudgment).map((item) => [item.thesis.thesisId, item.userJudgment || ""])));
    setThesisTexts(Object.fromEntries(draft.items.map((item) => [item.thesis.thesisId, item.thesis.text])));
    setQuestionTexts(Object.fromEntries(draft.questions.map((question) => [question.id, question.text])));
  }, [draft.id]);

  const confirmDraft = () => {
    const edits = draft.items
      .map((item) => ({ thesisId: item.thesis.thesisId, text: thesisTexts[item.thesis.thesisId] }))
      .filter((edit) => edit.text !== undefined && edit.text !== draft.items.find((item) => item.thesis.thesisId === edit.thesisId)?.thesis.text);
    const questions = draft.questions.map((question) => ({
      id: question.id,
      thesisId: question.thesisId,
      text: questionTexts[question.id] || question.text,
      requiredEvidence: question.requiredEvidence,
      status: question.status,
    }));
    onConfirmDraft(userJudgments, edits, questions);
  };

  const hasFiling = Boolean(draft.sourceManifest.latestCoveredPeriod);
  const hasPriorFiling = draft.baseStateVersion >= 1 && !isReadOnly;
  const isT0 = confirmedVersion === 0 && !hasFiling;
  const draftVersion = hasFiling && !isReadOnly ? draft.baseStateVersion + 1 : confirmedVersion;
  const displayVersion = isT0 ? 0 : Math.max(confirmedVersion, draftVersion);
  const awaitingConfirmation = hasFiling && !isConfirmed;

  const supportedCount = draft.items.filter((item) => item.proposed.status === "SUPPORTED" || item.proposed.status === "PARTIALLY_SUPPORTED").length;
  const weakenedCount = draft.items.filter((item) => item.proposed.status === "WEAKENED").length;
  const unresolvedCount = draft.items.filter((item) => item.proposed.status === "UNRESOLVED").length;
  const coveragePeriodText = draft.sourceManifest.latestCoveredPeriod
    ? `${draft.sourceManifest.latestCoveredPeriod.end}（${draft.sourceManifest.latestCoveredPeriod.basis === "YEAR" ? "年度报表" : "阶段报表"}）`
    : "尚未上传财报（基准观点）";

  const statusMeta = (status: string) => {
    if (status === "SUPPORTED") return { label: "已获支持", code: "SUPPORTED", className: "research-status-supported", icon: <CheckCircle2 /> };
    if (status === "PARTIALLY_SUPPORTED") return { label: "部分支持 / 进展中", code: "PARTIALLY_SUPPORTED", className: "research-status-partial", icon: <TrendingUp /> };
    if (status === "WEAKENED") return { label: "存在差距 / 削弱", code: "WEAKENED", className: "research-status-weakened", icon: <XCircle /> };
    return { label: "尚未到期 / 待决", code: "UNRESOLVED", className: "research-status-unresolved", icon: <HelpCircle /> };
  };

  return (
    <div className="research-page">
      <section className="research-header-card">
        <div>
          <div className="research-company-tags"><span className="research-company-tag">{securityCode} · {companyName}</span><span className="research-version-tag">版本：T{displayVersion} {isT0 ? "（初始基线）" : awaitingConfirmation ? "（待确认）" : "（本轮正式核验）"}</span>{isConfirmed && <span className="research-confirmed-tag"><Check className="h-3 w-3" />已确认入库</span>}</div>
          <h1>研报观点与财报持续核验工作台</h1>
          <p><Clock3 className="h-3.5 w-3.5" />官方财报覆盖时间：{coveragePeriodText}</p>
        </div>
        <div className="research-header-actions">
          {isConfirmed && !isT0 && <button type="button" onClick={onUpdateRound2} disabled={isUpdatingRound2} className="ft-btn ft-btn-primary"><RefreshCw className={isUpdatingRound2 ? "h-4 w-4 animate-spin" : "h-4 w-4"} />{isUpdatingRound2 ? "正在核验新财报..." : "上传下一期财报"}</button>}
          {!isT0 && !isReadOnly && <button type="button" onClick={confirmDraft} disabled={isUpdatingRound2} className="ft-btn ft-btn-success"><CheckCircle2 className="h-4 w-4" />保存并确认当前研究</button>}
        </div>
      </section>

      <section className="research-summary-bar">
        <div className="research-counts"><span className="is-supported"><CheckCircle2 />支持 {supportedCount} 条</span><i /> <span className="is-weakened"><AlertTriangle />削弱 {weakenedCount} 条</span><i /> <span className="is-unresolved"><HelpCircle />未解决 {unresolvedCount} 条</span></div>
        <span>跟踪观点总数：{draft.items.length} 条 · 稳定 thesisId 持续更新</span>
      </section>

      {hasPriorFiling && <div className="research-diff-banner"><TrendingUp className="h-5 w-5" /><div><strong>本次核验检测到财报发布变化（T{draft.baseStateVersion} → T{displayVersion} 演进 Diff）</strong><p>新一期财报已发布。系统沿用同一组 thesisId 计算本轮变化，并继承上一轮记录的研判备注与未决问题。</p></div></div>}

      <div className="research-section-heading"><h2>观点卡片与逐条核验 <span>({draft.items.length} 条)</span></h2><span>查看事实、差距与下一步问题</span></div>

      <div className="research-items-list">
        {draft.items.map((item, index) => {
          const thesis = item.thesis;
          const assessment = item.proposed;
          const meta = statusMeta(assessment.status);
          const thesisText = thesisTexts[thesis.thesisId] ?? thesis.text;
          return (
            <article key={thesis.thesisId} className={`research-item-card ${meta.className}`}>
              <div className="research-item-title-row"><div className="flex min-w-0 items-center gap-3"><span className="research-item-index">{index + 1}</span><div className="min-w-0"><h3>{thesisText}</h3><span className="research-item-id">{thesis.thesisId}</span></div></div><span className={`research-status ${meta.className}`}>{React.cloneElement(meta.icon, { className: "h-3.5 w-3.5" })}{meta.label}<small>{meta.code}</small></span></div>

              <div className="research-detail-grid">
                <div className="research-detail-block"><span><FileText />1. 原观点是什么</span><div><p>“{thesis.originalText}”</p><small>门槛属性：{thesis.criterion.kind === "COMPARE" ? `${thesis.criterion.metric} ${thesis.criterion.op || "GTE"} ${thesis.criterion.target || ""}${thesis.criterion.unit === "RATIO" ? "%" : ""}` : "趋势向上"} · 期间：{thesis.criterion.period?.end || "全年"}</small></div><textarea rows={2} value={thesisText} onChange={(event) => setThesisTexts({ ...thesisTexts, [thesis.thesisId]: event.target.value })} readOnly={isReadOnly} aria-label="本轮观点表述" /></div>
                <div className="research-detail-block"><span><ShieldCheck />2. 当前财报披露了什么</span><div className="research-fact-box"><p>{assessment.summary}</p></div></div>
                <div className="research-detail-block"><span><Target />3. 实际值与目标相差多少</span><div className="research-gap-box"><p>{assessment.observedGap?.text || "尚无显著数值差额（或属于定性/方向类观点）"}</p></div></div>
                <div className="research-detail-block"><span><AlertTriangle />4. 为什么出现这个结果</span><div className="research-cause-grid"><div><small>公司披露口径解释</small><p>{assessment.disclosedCauses[0]?.text || "本期未提取到带有效证据引用的公司披露原因。"}</p></div><div><small>待验证假说与风险</small><p>{assessment.hypotheses[0]?.text || "暂无带证据支持的待验证假设。"}</p></div></div></div>
                <div className="research-detail-block"><span><Edit3 />分析师独立研判 <em>持久化跨轮继承</em></span><input type="text" value={userJudgments[thesis.thesisId] || ""} onChange={(event) => setUserJudgments({ ...userJudgments, [thesis.thesisId]: event.target.value })} readOnly={isReadOnly} placeholder="记录您的独立判断、修正或仍需关注的风险..." className="ft-input" /></div>
                <div className="research-detail-block"><span><Search />5. 下一步还要研究什么</span>{assessment.nextQuestions?.length ? <div className="research-question-box"><Search className="h-4 w-4" /><input value={questionTexts[assessment.nextQuestions[0].id] ?? assessment.nextQuestions[0].text} onChange={(event) => setQuestionTexts({ ...questionTexts, [assessment.nextQuestions[0].id]: event.target.value })} readOnly={isReadOnly} aria-label="下一步研究问题" /></div> : <div className="research-empty-box">本期指标已达标或无进一步开放问题。</div>}</div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
