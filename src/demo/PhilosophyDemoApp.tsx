import React, { useEffect, useMemo, useState } from "react";
import { Archive, Info, ArrowUpRight } from "lucide-react";
import { PHILOSOPHY_DEMO, DEMO_VERSION_IDS, LATEST_DEMO_VERSION } from "./philosophyDemo";
import { BRIEFS, FALLBACK_BRIEF, briefKey } from "./briefs";
import { ThesisRow } from "./ThesisRow";
import { EvidenceDrawer } from "./EvidenceDrawer";
import { ArchiveDrawer } from "./ArchiveDrawer";
import { DesignNotesDrawer } from "./DesignNotesDrawer";
import "./demo.css";

/**
 * Research Desk — the philosophy demo.
 *
 * ISOLATION: everything here lives under `src/demo/`. It imports nothing from
 * `src/server/**` or the real research components, performs no `fetch`, creates
 * no project and writes no Research Memory. The real pipeline imports nothing
 * from here either. The separation is structural and enforced by
 * tests/demo-isolation.test.ts, so the demo cannot pollute real state however
 * it is clicked.
 *
 * SHAPE: the page answers one question — what changed since I last looked — and
 * defers everything else. Three theses, four lines each. The report's original
 * wording, the cause layering and the argument admission gate sit behind one
 * disclosure per row; the verification chain behind any number sits in a side
 * panel; documents, open questions and corrections sit in the archive. The
 * design principles themselves are documented behind 设计说明 rather than
 * narrated on the desk, because the interface is supposed to demonstrate them.
 */

interface Props {
  /** Lets the host app expose the real pipeline without a second chrome bar. */
  onOpenRealPipeline?: () => void;
}

export const PhilosophyDemoApp: React.FC<Props> = ({ onOpenRealPipeline }) => {
  const demo = PHILOSOPHY_DEMO;
  const [version, setVersion] = useState<string>(LATEST_DEMO_VERSION);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [evidenceArg, setEvidenceArg] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  const versionIndex = Math.max(0, DEMO_VERSION_IDS.indexOf(version));
  const active = demo.versions[versionIndex];
  const previous = versionIndex > 0 ? demo.versions[versionIndex - 1] : null;

  /* Switching round resets the disclosure state: a new round is a new read. */
  useEffect(() => {
    setExpanded({});
    setEvidenceArg(null);
  }, [version]);

  /* Rows are ordered changed-first, so the round's movement is what meets the
     eye; theses the new material does not touch sink and dim. */
  const rows = useMemo(() => {
    return demo.theses
      .map((thesis) => ({
        thesis,
        view: thesis.versions[version],
        brief: BRIEFS[briefKey(thesis.thesisId, version)] ?? {
          ...FALLBACK_BRIEF,
          assessment: thesis.versions[version]?.rollUp.honestConclusion ?? "",
          nextStep: thesis.versions[version]?.rollUp.rule[0] ?? "",
        },
      }))
      .filter((r) => r.view)
      .sort((a, b) => {
        const aw = a.brief.noNewEvidence ? 1 : 0;
        const bw = b.brief.noNewEvidence ? 1 : 0;
        if (aw !== bw) return aw - bw;
        return a.thesis.priority - b.thesis.priority;
      });
  }, [demo.theses, version]);

  const changedCount = rows.filter((r) => r.brief.change && !r.brief.noNewEvidence).length;

  /* Evidence drawer target */
  const evidenceTarget = useMemo(() => {
    if (!evidenceArg) return null;
    for (const thesis of demo.theses) {
      const claim = thesis.claims.find((c) => c.argumentId === evidenceArg);
      if (claim) return { claim, av: claim.versions[version] ?? null };
    }
    return null;
  }, [demo.theses, evidenceArg, version]);

  return (
    <div className="rd">
      <div className="rd-shell">
        <header className="rd-top">
          <div className="rd-id">
            <h1>
              {demo.meta.company}
              <span className="rd-ticker">
                {demo.meta.securityCode}.{demo.meta.exchange}
              </span>
            </h1>
            <p className="rd-coverage">
              覆盖 <b>{active.label.replace(/^T\d · /, "")}</b> · 已确认 {active.version} · asOf {active.asOf} ·{" "}
              {demo.meta.industry}
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
              onToggle={() =>
                setExpanded((prev) => ({ ...prev, [thesis.thesisId]: !prev[thesis.thesisId] }))
              }
              onOpenEvidence={setEvidenceArg}
            />
          ))}
        </main>

        <footer className="rd-foot">
          <span>合成数据 · 非真实披露 · 不构成投资建议</span>
          <span>只读：不创建项目、不调用模型、不写入研究记忆</span>
        </footer>
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
