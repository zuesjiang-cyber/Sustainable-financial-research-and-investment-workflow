import React from "react";
import { FileText, GitCompareArrows, HelpCircle, UserCog } from "lucide-react";
import type { ResearchVersion } from "./types";
import { CORRECTION_KIND, QUESTION_STATE } from "./meta";
import { Drawer } from "./Drawer";

/**
 * The research archive: what this round was triggered by, what actually moved,
 * which documents are frozen into the pack, which questions remain open, and
 * what the researcher corrected.
 *
 * All of it sits behind one entry rather than on the desk. These are supporting
 * views — the thesis is the protagonist, the documents are the evidence — and a
 * page that leads with them asks the analyst to understand the system's data
 * model before answering their own question.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  version: ResearchVersion;
  previous: ResearchVersion | null;
}

export const ArchiveDrawer: React.FC<Props> = ({ open, onClose, version, previous }) => {
  const d = version.stateDelta;
  const openQuestions = version.questions.filter((q) => q.status === "OPEN").length;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`研究档案 · ${version.label}`}
      sub={previous ? `${previous.version} → ${version.version} · asOf ${version.asOf}` : `${version.version} 基线 · asOf ${version.asOf}`}
    >
      <section className="rd-arch-sec">
        <h3>
          <GitCompareArrows />
          本轮触发与状态变化
        </h3>
        <p style={{ margin: "0 0 14px", fontSize: 13, lineHeight: 1.75, color: "var(--rd-text-2)" }}>
          {version.trigger}
        </p>

        <DeltaList label="发生变化" items={d.changed} tone="var(--rd-ok)" />
        <DeltaList
          label="刻意未变"
          items={d.unchanged}
          tone="var(--rd-text-3)"
          note="未变也是状态的一部分：不因新资料而被覆盖。"
        />
        <DeltaList label="新增未决" items={d.newlyUnresolved} tone="var(--rd-weak)" />
      </section>

      <section className="rd-arch-sec">
        <h3>
          <FileText />
          冻结资料包 · {version.documents.length} 份
        </h3>
        {version.documents.map((doc) => (
          <div className="rd-doc" key={`${doc.fileName}-${doc.period}`}>
            <div style={{ minWidth: 0 }}>
              <div className="rd-doc-name">{doc.fileName}</div>
              <div style={{ fontSize: 11, color: "var(--rd-text-3)", marginTop: 2 }}>
                {doc.role === "THESIS_SOURCE" ? "研报" : "定期报告"} · {doc.period}
              </div>
            </div>
            <div className="rd-doc-meta">
              {doc.pages}p
              <br />
              sha {doc.sha256Short}
            </div>
          </div>
        ))}
        <p className="rd-q-from" style={{ marginTop: 10 }}>
          资料包在确认时冻结；后续轮次沿用同一 thesisId 与 argumentId，不重建项目。
        </p>
      </section>

      <section className="rd-arch-sec">
        <h3>
          <HelpCircle />
          未决问题 · {openQuestions} / {version.questions.length}
        </h3>
        {version.questions.map((q, i) => {
          const meta = QUESTION_STATE[q.status] ?? QUESTION_STATE.OPEN;
          return (
            <div className="rd-q" key={i}>
              <div className="rd-q-top">
                <p>{q.text}</p>
                <span className={meta.className}>{meta.label}</span>
              </div>
              {q.answer && <p className="rd-q-answer">{q.answer}</p>}
              <p className="rd-q-from">
                提出于 {q.createdIn}
                {q.createdIn !== version.version && ` · 跨 ${version.version} 仍在跟踪`}
              </p>
            </div>
          );
        })}
        <p className="rd-q-from" style={{ marginTop: 10 }}>
          部分回答转为延后而不是关闭；问题不会只增不减。
        </p>
      </section>

      <section className="rd-arch-sec">
        <h3>
          <UserCog />
          用户修正与研判 · {version.corrections.length} 条
        </h3>
        {version.corrections.length === 0 ? (
          <p className="rd-empty">本轮用户未作修正，系统输出未经人工干预。</p>
        ) : (
          version.corrections.map((c, i) => (
            <div className="rd-corr" key={i}>
              <div className="rd-corr-label">
                {CORRECTION_KIND[c.type] ?? c.type} · {c.label}
                {c.carriedForward && <span style={{ color: "var(--rd-text-3)", fontWeight: 500 }}>结转生效</span>}
              </div>
              <p className="rd-corr-before">{c.before}</p>
              <p className="rd-corr-after">{c.after}</p>
              <p className="rd-corr-why">{c.reason}</p>
            </div>
          ))
        )}
        <p className="rd-q-from" style={{ marginTop: 10 }}>
          用户修正是下一轮的输入而非批注：模型输出不会覆盖它，历史版本也不会被就地改写。
        </p>
      </section>
    </Drawer>
  );
};

const DeltaList: React.FC<{ label: string; items: string[]; tone: string; note?: string }> = ({
  label,
  items,
  tone,
  note,
}) => (
  <div style={{ marginBottom: 14 }}>
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: tone,
        marginBottom: 6,
      }}
    >
      {label} · {items.length}
    </div>
    {items.length === 0 ? (
      <p className="rd-empty" style={{ padding: "2px 0" }}>
        无
      </p>
    ) : (
      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, lineHeight: 1.85, color: "var(--rd-text-2)" }}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    )}
    {note && <p className="rd-q-from" style={{ marginTop: 5 }}>{note}</p>}
  </div>
);
