import React, { useEffect, useMemo, useState } from "react";
import { Archive, Info, ArrowUpRight, Play } from "lucide-react";
import { PHILOSOPHY_DEMO, DEMO_VERSION_IDS, LATEST_DEMO_VERSION } from "./philosophyDemo";
import { BRIEFS, FALLBACK_BRIEF, briefKey } from "./briefs";
import { ThesisRow } from "./ThesisRow";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { ArchiveDrawer } from "./ArchiveDrawer";
import { DesignNotesDrawer } from "./DesignNotesDrawer";
import { AnalysisRun } from "./AnalysisRun";
import { ReviewSurface } from "./ReviewSurface";
import "./demo.css";

/**
 * FinTrust demo — four surfaces, one story.
 *
 *   ① 分析动画   an agent working, not a trace of it working
 *   ② 分析结果   事实（二元）/ 推论（克制且标注）/ 本次未涉及，待用户确认
 *   ③ 研究台     确认后的沉淀，四行一条观点
 *   ④ 证据侧栏   从任意数字或原话溯源
 *
 * ISOLATION: everything lives under `src/demo/`. No import from `src/server/**`
 * or the real research components, no `fetch`, no project creation, no Research
 * Memory writes. The real pipeline imports nothing from here either. Enforced by
 * tests/demo-isolation.test.ts, so the demo cannot pollute real state however it
 * is clicked.
 *
 * The default landing is the desk at the latest round: it is the richest state
 * and the calmest first impression. The analysis surfaces are replayable from
 * there for any round, which is how the product intends them to be revisited —
 * you read the answer first, and watch how it was reached when you want to.
 */

interface Props {
  /** Lets the host app expose the real pipeline without a second chrome bar. */
  onOpenRealPipeline?: () => void;
}

type Phase = "desk" | "running" | "review";

export const PhilosophyDemoApp: React.FC<Props> = ({ onOpenRealPipeline }) => {
  const demo = PHILOSOPHY_DEMO;
  const [version, setVersion] = useState<string>(LATEST_DEMO_VERSION);
  const [phase, setPhase] = useState<Phase>("desk");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [evidenceArg, setEvidenceArg] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  /** Judgements written during this session, surviving the return to the desk. */
  const [sessionJudgments, setSessionJudgments] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<string | null>(null);

  const versionIndex = Math.max(0, DEMO_VERSION_IDS.indexOf(version));
  const active = demo.versions[versionIndex];
  const previous = versionIndex > 0 ? demo.versions[versionIndex - 1] : null;

  /* Switching round resets the read: a new round is a new page. */
  useEffect(() => {
    setExpanded({});
    setEvidenceArg(null);
    setConfirmed(null);
  }, [version]);

  const rows = useMemo(() => {
    return demo.theses
      .map((thesis) => {
        const base = thesis.versions[version];
        if (!base) return null;
        const judgment = sessionJudgments[thesis.thesisId];
        return {
          thesis,
          /* A judgement written in 画面二 lands on the desk as the user's own
             words — alongside the system's conclusion, never replacing it. */
          view: judgment ? { ...base, userJudgment: judgment } : base,
          brief: BRIEFS[briefKey(thesis.thesisId, version)] ?? {
            ...FALLBACK_BRIEF,
            assessment: base.rollUp.honestConclusion,
            nextStep: "",
          },
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => {
        const aw = a.brief.noNewEvidence ? 1 : 0;
        const bw = b.brief.noNewEvidence ? 1 : 0;
        if (aw !== bw) return aw - bw;
        return a.thesis.priority - b.thesis.priority;
      });
  }, [demo.theses, version, sessionJudgments]);

  const changedCount = rows.filter((r) => r.brief.change && !r.brief.noNewEvidence).length;

  const evidenceTarget = useMemo(() => {
    if (!evidenceArg) return null;
    for (const thesis of demo.theses) {
      const claim = thesis.claims.find((c) => c.argumentId === evidenceArg);
      if (claim) return { claim, av: claim.versions[version] ?? null };
    }
    return null;
  }, [demo.theses, evidenceArg, version]);

  const filing = active.documents.find((d) => d.role === "FINANCIAL_FILING");
  const disclosureTitle = filing
    ? `${filing.fileName} · ${filing.period}`
    : `${active.label} · ${active.trigger}`;

  return (
    <div className="rd">
      <div className="rd-shell">
        {phase === "desk" && (
          <>
            <header className="rd-top">
              <div className="rd-id">
                <h1>
                  {demo.meta.company}
                  <span className="rd-ticker">
                    {demo.meta.securityCode}.{demo.meta.exchange}
                  </span>
                </h1>
                <p className="rd-coverage">
                  覆盖 <b>{active.label.replace(/^T\d · /, "")}</b> · 已确认 {active.version} · asOf{" "}
                  {active.asOf} · {demo.meta.industry}
                </p>
              </div>

              <div className="rd-controls">
                <div className="rd-seg" role="group" aria-label="研究状态版本">
                  {demo.versions.map((v) => (
                    <button
                      key={v.version}
                      type="button"
                      onClick={() => setVersion(v.version)}
                      aria-pressed={v.version === version}
                      title={v.label}
                    >
                      {v.version}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="rd-ghost is-accent"
                  onClick={() => setPhase("running")}
                  title="重放本轮的分析过程"
                >
                  <Play />
                  本轮分析过程
                </button>
                <button type="button" className="rd-ghost" onClick={() => setArchiveOpen(true)}>
                  <Archive />
                  研究档案
                </button>
                <button type="button" className="rd-ghost" onClick={() => setNotesOpen(true)}>
                  <Info />
                  设计说明
                </button>
                {onOpenRealPipeline && (
                  <button type="button" className="rd-ghost" onClick={onOpenRealPipeline} title="切换到真实管线">
                    真实工作台
                    <ArrowUpRight />
                  </button>
                )}
              </div>
            </header>

            <section className="rd-round">
              <div className="rd-round-kicker">
                {active.version} 本轮 · {changedCount} 项变化
              </div>
              <h2>{active.stateDelta.headline}</h2>
              {confirmed === version && (
                <p className="rd-confirmed">
                  你已确认本轮结果
                  {Object.keys(sessionJudgments).length > 0 &&
                    ` · ${Object.keys(sessionJudgments).length} 条你的判断已写入状态`}
                </p>
              )}
            </section>

            <main className="rd-list">
              {rows.map(({ thesis, view, brief }) => (
                <ThesisRow
                  key={thesis.thesisId}
                  thesis={thesis}
                  view={view}
                  brief={brief}
                  activeVersion={version}
                  expanded={Boolean(expanded[thesis.thesisId])}
                  onToggle={() => setExpanded((p) => ({ ...p, [thesis.thesisId]: !p[thesis.thesisId] }))}
                  onOpenEvidence={setEvidenceArg}
                />
              ))}
            </main>

            <footer className="rd-foot">
              <span>合成数据 · 非真实披露 · 不构成投资建议</span>
              <span>只读：不创建项目、不调用模型、不写入研究记忆</span>
            </footer>
          </>
        )}

        {phase === "running" && (
          <AnalysisRun
            trigger={active.trigger}
            disclosureTitle={disclosureTitle}
            onDone={() => setPhase("review")}
          />
        )}

        {phase === "review" && (
          <ReviewSurface
            version={active}
            theses={demo.theses}
            onOpenEvidence={setEvidenceArg}
            onConfirm={(judgments) => {
              setSessionJudgments((prev) => ({ ...prev, ...judgments }));
              setConfirmed(version);
              setPhase("desk");
            }}
            onCancel={() => setPhase("desk")}
          />
        )}
      </div>

      <EvidenceDrawer
        open={Boolean(evidenceArg && evidenceTarget?.av)}
        onClose={() => setEvidenceArg(null)}
        claim={evidenceTarget?.claim ?? null}
        av={evidenceTarget?.av ?? null}
        version={version}
      />

      <ArchiveDrawer open={archiveOpen} onClose={() => setArchiveOpen(false)} version={active} previous={previous} />

      <DesignNotesDrawer open={notesOpen} onClose={() => setNotesOpen(false)} demo={demo} />
    </div>
  );
};

export default PhilosophyDemoApp;
