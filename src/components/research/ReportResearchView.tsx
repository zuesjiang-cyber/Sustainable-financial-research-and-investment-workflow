import React, { useEffect, useState } from "react";
import {
  FileText,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  ArrowRight,
  Clock,
  RefreshCw,
  Edit3,
  Check,
  Target,
  Search,
} from "lucide-react";
import type {
  Draft,
} from "../../shared/domain";

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
}) => {
  const [userJudgments, setUserJudgments] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const item of draft.items) {
      if (item.userJudgment) {
        initial[item.thesis.thesisId] = item.userJudgment;
      }
    }
    return initial;
  });
  const [thesisTexts, setThesisTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(draft.items.map((item) => [item.thesis.thesisId, item.thesis.text]))
  );
  const [questionTexts, setQuestionTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(draft.questions.map((question) => [question.id, question.text]))
  );

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

  const getStatusBadge = (status: string, maturity: string) => {
    if (status === "SUPPORTED") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-950/80 border border-emerald-800 text-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5" /> 已获支持 (SUPPORTED)
        </span>
      );
    }
    if (status === "PARTIALLY_SUPPORTED") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-950/80 border border-blue-800 text-blue-300">
          <TrendingUp className="w-3.5 h-3.5" /> 部分支持 / 进展中 ({maturity})
        </span>
      );
    }
    if (status === "WEAKENED") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-950/80 border border-rose-800 text-rose-300">
          <AlertTriangle className="w-3.5 h-3.5" /> 存在差距 / 削弱 (WEAKENED)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-950/80 border border-amber-800 text-amber-300">
        <HelpCircle className="w-3.5 h-3.5" /> 尚未到期 / 待决 (UNRESOLVED)
      </span>
    );
  };

  const isRound2 = draft.baseStateVersion >= 1 || confirmedVersion >= 2;
  const isT0 = confirmedVersion === 0 && !isRound2;

  // Top summary counts per Walkthrough Section 9: 支持 X 条 ｜ 削弱 Y 条 ｜ 未解决 Z 条
  const supportedCount = draft.items.filter(
    (i) => i.proposed.status === "SUPPORTED" || i.proposed.status === "PARTIALLY_SUPPORTED"
  ).length;
  const weakenedCount = draft.items.filter(
    (i) => i.proposed.status === "WEAKENED"
  ).length;
  const unresolvedCount = draft.items.filter(
    (i) => i.proposed.status === "UNRESOLVED"
  ).length;

  const coveragePeriodText = draft.sourceManifest.latestCoveredPeriod
    ? `${draft.sourceManifest.latestCoveredPeriod.end} (${draft.sourceManifest.latestCoveredPeriod.basis === "YEAR" ? "年度报表" : "阶段报表"})`
    : "尚未上传财报 (基准观点)";

  return (
    <div className="max-w-5xl mx-auto py-8 px-6 space-y-8 animate-in fade-in duration-300 text-slate-100">
      {/* Header bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-blue-500/15 border border-blue-500/30 text-blue-400 rounded-lg text-xs font-mono font-bold">
              {securityCode} · {companyName}
            </span>
            <span className="px-2.5 py-0.5 bg-slate-800 text-slate-300 rounded text-xs font-medium">
              版本：T{confirmedVersion} {isRound2 ? "(年报正式核验)" : isT0 ? "(初始基线)" : "(三季报阶段核验)"}
            </span>
            {isConfirmed && (
              <span className="px-2.5 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded text-xs font-medium flex items-center gap-1">
                <Check className="w-3 h-3" /> 已确认入库
              </span>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            研报观点与财报持续核验工作台
          </h2>
          <p className="text-xs text-slate-400 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            官方财报覆盖时间：{coveragePeriodText}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {!isRound2 && !isT0 && (
            <button
              onClick={onUpdateRound2}
              disabled={isUpdatingRound2}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 flex items-center gap-2 cursor-pointer transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${isUpdatingRound2 ? "animate-spin" : ""}`} />
              {isUpdatingRound2 ? "正在核验新财报..." : "上传下一期财报 (T2 更新)"}
            </button>
          )}
          {!isT0 && (
            <button
              onClick={confirmDraft}
              disabled={isUpdatingRound2}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-2 cursor-pointer transition-all"
            >
              <CheckCircle2 className="w-4 h-4" />
              保存并确认当前研究
            </button>
          )}
        </div>
      </div>

      {/* Top summary bar per Walkthrough Section 9: 支持 X 条 ｜ 削弱 Y 条 ｜ 未解决 Z 条 */}
      <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl px-6 py-4 flex flex-wrap items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-4 text-sm font-bold text-slate-200">
          <span className="text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> 支持 {supportedCount} 条
          </span>
          <span className="text-slate-600">｜</span>
          <span className="text-rose-400 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> 削弱 {weakenedCount} 条
          </span>
          <span className="text-slate-600">｜</span>
          <span className="text-amber-400 flex items-center gap-1.5">
            <HelpCircle className="w-4 h-4" /> 未解决 {unresolvedCount} 条
          </span>
        </div>
        <div className="text-xs text-slate-400">
          跟踪观点总数：{draft.items.length} 条 · 稳定 thesisId 持续更新
        </div>
      </div>

      {/* Round 2 Diff Notification Banner */}
      {isRound2 && (
        <div className="p-4 bg-blue-950/40 border border-blue-800/80 rounded-2xl flex items-start gap-3 text-xs text-blue-200 animate-in slide-in-from-top-2">
          <TrendingUp className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-white block">本次核验检测到财报发布变化 (T1 → T2 演进 Diff)：</span>
            <p className="leading-relaxed text-blue-200/90">
              新一期财报已发布。核验状态由【部分支持/进展中】更新为【充分支持/已到期】；继承您在上一轮记录的研判备注，旧待解问题已自动解答闭环。
            </p>
          </div>
        </div>
      )}

      {/* Thesis Cards answering the 5 fixed questions */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
            观点卡片与逐条核验 ({draft.items.length} 条)
          </h3>
          <span className="text-xs text-slate-500">点击引文可溯源至原页 PDF 证据</span>
        </div>

        {draft.items.map((item, index) => {
          const thesis = item.thesis;
          const assessment = item.proposed;
          const thesisText = thesisTexts[thesis.thesisId] ?? thesis.text;

          return (
            <div
              key={thesis.thesisId}
              className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6 sm:p-7 space-y-6 shadow-xl hover:border-slate-700 transition-all"
            >
              {/* Card Title & Status Badge */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold flex items-center justify-center font-mono">
                    {index + 1}
                  </span>
                  <h4 className="text-base sm:text-lg font-bold text-white tracking-tight">
                    {thesisText}
                  </h4>
                </div>
                <div>{getStatusBadge(assessment.status, assessment.maturity)}</div>
              </div>

              {/* 1. 原观点是什么 */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-400" /> 1. 原观点是什么 (Original Claim)
                </span>
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/90 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-mono text-slate-300 leading-relaxed">
                      "{thesis.originalText}"
                    </p>
                    <span className="text-[11px] text-slate-500 block">
                      门槛属性：{thesis.criterion.kind === "COMPARE" ? `${thesis.criterion.metric} ${thesis.criterion.op || "GTE"} ${thesis.criterion.target || ""}${thesis.criterion.unit === "RATIO" ? "%" : ""}` : "趋势向上"} · 期间：{thesis.criterion.period?.end || "全年"}
                    </span>
                  </div>
                </div>
                <textarea
                  rows={2}
                  value={thesisText}
                  onChange={(event) => setThesisTexts({ ...thesisTexts, [thesis.thesisId]: event.target.value })}
                  className="w-full mt-3 bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  aria-label="本轮观点表述"
                />
              </div>

              {/* 2. 当前财报披露了什么 */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> 2. 当前财报披露了什么 (Verified Facts)
                </span>
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/90 space-y-2">
                  <p className="text-xs text-slate-200 leading-relaxed font-medium">
                    {assessment.summary}
                  </p>
                </div>
              </div>

              {/* 3. 实际值与目标相差多少 */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-blue-400" /> 3. 实际值与目标相差多少 (Observed Gap)
                </span>
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/90 text-xs font-mono text-emerald-300 flex items-center justify-between">
                  <span>{assessment.observedGap?.text || "尚无显著数值差额（或属于定性/方向类观点）"}</span>
                </div>
              </div>

              {/* 4. 为什么出现这个结果 */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> 4. 为什么出现这个结果 (归因与假设)
                </span>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                    <span className="text-[11px] text-slate-400 font-semibold block">公司披露口径解释：</span>
                    <p className="text-slate-300 leading-relaxed">
                      {assessment.disclosedCauses[0]?.text || "本期未提取到带有效证据引用的公司披露原因。"}
                    </p>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                    <span className="text-[11px] text-amber-400 font-semibold block">待验证假说与风险：</span>
                    <p className="text-slate-300 leading-relaxed">
                      {assessment.hypotheses[0]?.text || "暂无带证据支持的待验证假设。"}
                    </p>
                  </div>
                </div>
              </div>

              {/* 分析师修正与独立判断 */}
              <div className="space-y-2 pt-2 border-t border-slate-800/60">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-purple-400" /> 分析师独立研判 (持久化跨轮继承)
                  </span>
                  <span className="text-[11px] text-slate-500">不被系统模型覆盖</span>
                </div>
                <input
                  type="text"
                  value={userJudgments[thesis.thesisId] || ""}
                  onChange={(e) =>
                    setUserJudgments({
                      ...userJudgments,
                      [thesis.thesisId]: e.target.value,
                    })
                  }
                  placeholder="记录您的独立判断、修正或仍需关注的风险..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 font-sans"
                />
              </div>

              {/* 5. 下一步还要研究什么 */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-blue-400" /> 5. 下一步还要研究什么 (Next Questions)
                </span>
                {assessment.nextQuestions && assessment.nextQuestions.length > 0 ? (
                  <div className="p-3.5 rounded-2xl bg-blue-950/20 border border-blue-900/40 text-xs text-slate-300 flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-bold shrink-0">
                      后续核验线索
                    </span>
                    <input
                      value={questionTexts[assessment.nextQuestions[0].id] ?? assessment.nextQuestions[0].text}
                      onChange={(event) => setQuestionTexts({ ...questionTexts, [assessment.nextQuestions[0].id]: event.target.value })}
                      className="w-full bg-transparent text-xs text-slate-300 focus:outline-none"
                      aria-label="下一步研究问题"
                    />
                  </div>
                ) : (
                  <div className="p-3 text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800">
                    本期指标已达标或无进一步开放问题。
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
