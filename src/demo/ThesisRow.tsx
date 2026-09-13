import React from "react";
import {
  ChevronRight,
  FileText,
  Lightbulb,
  MessageSquareQuote,
  ScrollText,
  UserCheck,
} from "lucide-react";
import type {
  ArgumentVersion,
  AtomicClaim,
  MissingEvidence,
  Thesis,
  ThesisBrief,
  ThesisVersionView,
} from "./types";
import { ATTRIBUTION, MATURITY, SIGNAL, STATUS, SUPPORT } from "./meta";
import { renderWithFigures, type FigureLookup } from "./figures";

/**
 * One thesis on the research desk.
 *
 * Collapsed, it answers the only three questions an analyst has on reopening a
 * project: did this move, what does the evidence now say, and what do I watch
 * next. Everything else — the report's original wording, the cause layering,
 * the argument-by-argument admission gate — sits behind one disclosure, because
 * a card that shows its whole reasoning chain at once stops being scannable.
 *
 * The disclosure is phrased as the question the user would actually ask. A
 * thesis whose headline number passed but whose status did not is the most
 * informative case in the product, so it asks "为什么不是「已验证」".
 */

interface Props {
  thesis: Thesis;
  view: ThesisVersionView;
  brief: ThesisBrief;
  activeVersion: string;
  expanded: boolean;
  onToggle: () => void;
  onOpenEvidence: (argumentId: string) => void;
}

/** The question the status invites, rather than a generic "详情". */
function disclosureLabel(status: ThesisVersionView["status"]): string {
  switch (status) {
    case "SUPPORTED":
      return "依据与论据";
    case "PARTIALLY_SUPPORTED":
      return "为什么不是「已验证」";
    case "WEAKENED":
      return "为什么判定为「被削弱」";
    default:
      return "缺什么才能定论";
  }
}

/**
 * The confirmed revision carries its threshold inline — "（核验门槛：…）". On the
 * desk the title should read as the thesis, with the threshold as a quiet
 * specification line beneath it, so the split is made here rather than baked
 * into the fixture.
 */
/**
 * Normalises an evidence request so that two arguments asking for the same
 * disclosure in slightly different words collapse into one line. Punctuation,
 * spacing and Chinese filler particles carry no identifying information, so
 * they are stripped before comparison; the leading characters are what actually
 * distinguish one request from another.
 */
export function normaliseRequest(text: string): string {
  return text
    .replace(/[\s，。、；：（）()「」『』【】/·—\-–]/g, "")
    .replace(/[或的与和及了是在]/g, "")
    .slice(0, 10);
}

function splitCriterion(statement: string): { title: string; criterion: string | null } {
  const m = statement.match(/^(.*?)（核验门槛：(.+?)）[。.]?$/);
  if (!m) return { title: statement, criterion: null };
  return { title: m[1].trim(), criterion: m[2].trim() };
}

export const ThesisRow: React.FC<Props> = ({
  thesis,
  view,
  brief,
  activeVersion,
  expanded,
  onToggle,
  onOpenEvidence,
}) => {
  const status = STATUS[view.status];
  const { title, criterion } = splitCriterion(thesis.currentStatement);
  const StatusIcon = status.Icon;
  const changed = Boolean(brief.change) && !brief.noNewEvidence;

  const lookup: FigureLookup = (argumentId) =>
    thesis.claims.find((c) => c.argumentId === argumentId)?.versions[activeVersion];
  const fig = (text: string) => renderWithFigures(text, { lookup, onOpen: onOpenEvidence });

  const maturity = MATURITY[view.maturity];

  /* Cause layering is assembled from every argument's semantic channel, and the
     two tiers are never merged: what the company disclosed is not the same kind
     of thing as what the system hypothesises. */
  const disclosed: Array<{ text: string; kind: string; note?: string }> = [];
  const hypotheses: Array<{ text: string; kind: string }> = [];
  /* Several arguments can ask for the same disclosure, so the list is deduped
     on a normalised key — an analyst reading "分产品毛利率" three times in one
     sentence stops reading the sentence. */
  const missing: MissingEvidence[] = [];
  const seenMissing = new Set<string>();
  for (const claim of thesis.claims) {
    const av = claim.versions[activeVersion];
    if (!av?.semantic) continue;
    for (const a of av.semantic.attributions) {
      if (a.kind === "SYSTEM_HYPOTHESIS") hypotheses.push({ text: a.text, kind: a.label });
      else disclosed.push({ text: a.text, kind: a.label });
    }
    for (const m of av.semantic.missingEvidence) {
      const key = normaliseRequest(m.what);
      if (seenMissing.has(key)) continue;
      seenMissing.add(key);
      missing.push(m);
    }
  }

  const admitted = view.rollUp.admitted;

  return (
    <article className={`rd-row${changed ? " is-changed" : ""}${brief.noNewEvidence ? " is-quiet" : ""}`}>
      <div className="rd-row-head">
        <div>
          <h3 className="rd-row-title">{title}</h3>
          {criterion && <p className="rd-criterion">核验门槛 · {criterion}</p>}
          {brief.change && <p className="rd-row-change">本轮变化 · {brief.change}</p>}
        </div>
        <span className={status.pill} title={`${view.status} · 核验窗口${maturity.label}`}>
          <StatusIcon />
          {status.label}
          <code>{view.status}</code>
        </span>
      </div>

      <p className="rd-verdict">
        {brief.noNewEvidence ? (
          <>本次资料未涉及该论述，沿用上一轮状态——<strong>未被重新验证</strong>。</>
        ) : (
          <>
            <strong>{fig(brief.keyFact)}</strong>
            {brief.gap && <>，{fig(brief.gap)}</>}。{fig(brief.assessment)}
          </>
        )}
      </p>

      {!brief.noNewEvidence && brief.nextStep && (
        <p className="rd-next">
          <span className="rd-next-label">下一步</span>
          <span>{brief.nextStep}</span>
        </p>
      )}

      <button
        type="button"
        className="rd-why"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`body-${thesis.thesisId}`}
      >
        <ChevronRight />
        {expanded ? "收起" : disclosureLabel(view.status)}
      </button>

      {expanded && (
        <div className="rd-body" id={`body-${thesis.thesisId}`}>
          <div className="rd-body-inner">
            {/* 1 — what the report actually said */}
            <section className="rd-sec">
              <div className="rd-sec-label">
                <ScrollText />
                研报原话
              </div>
              <blockquote className="rd-quote">
                {thesis.originalStatement}
                <span className="rd-quote-src">
                  {thesis.originalSource.fileName} · 第 {thesis.originalSource.page} 页 ·{" "}
                  {thesis.originalSource.locator}
                </span>
              </blockquote>
              {thesis.currentStatement !== thesis.originalStatement && (
                <p className="rd-cause-note">
                  现核验文本为第 {thesis.revision} 版修订；原句保留可回溯，后续轮次不会改写它。
                </p>
              )}
            </section>

            {/* The gap is already stated quantitatively in the verdict line and
                computed in full inside the evidence drawer, so it is not
                repeated as its own section here. */}

            {/* 2 — cause layering: disclosed vs hypothesised, kept apart */}
            {(disclosed.length > 0 || hypotheses.length > 0) && (
              <section className="rd-sec">
                <div className="rd-sec-label">
                  <MessageSquareQuote />
                  原因分层
                </div>
                <div className="rd-causes">
                  <div className="rd-cause">
                    <div className="rd-cause-kind">公司已披露</div>
                    {disclosed.length === 0 ? (
                      <p className="rd-cause-note">本轮资料中公司未说明原因。</p>
                    ) : (
                      disclosed.map((d, i) => {
                        const meta = ATTRIBUTION[d.kind];
                        return (
                          <React.Fragment key={i}>
                            <p>{d.text}</p>
                            {meta && <p className="rd-cause-note">{d.kind === "MANAGEMENT_EXPLANATION" ? meta.note : meta.label}</p>}
                          </React.Fragment>
                        );
                      })
                    )}
                  </div>
                  <div className="rd-cause is-hypo">
                    <div className="rd-cause-kind">仍需验证的解释</div>
                    {hypotheses.length === 0 && missing.length === 0 ? (
                      <p className="rd-cause-note">本轮无系统假设。</p>
                    ) : (
                      <>
                        {hypotheses.map((h, i) => (
                          <p key={i}>{h.text}</p>
                        ))}
                        {missing.length > 0 && (
                          <div className="rd-missing">
                            <span className="rd-missing-label">仍缺</span>
                            <ul>
                              {missing.map((m, i) => (
                                <li key={i}>
                                  {m.what}
                                  <em>{m.whereToLook}</em>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* 4 — the admission gate, argument by argument */}
            <section className="rd-sec">
              <div className="rd-sec-label">
                <FileText />
                论据 · 采纳 {admitted.length} / {thesis.claims.length}
              </div>
              <div className="rd-args">
                {thesis.claims.map((claim) => (
                  <ArgumentLine
                    key={claim.argumentId}
                    claim={claim}
                    av={claim.versions[activeVersion]}
                    admitted={admitted.includes(claim.argumentId)}
                    onOpenEvidence={onOpenEvidence}
                  />
                ))}
              </div>

              <div className="rd-rollup">
                <p>
                  <strong>{view.rollUp.honestConclusion}</strong>
                </p>
                <div className="rd-naive">
                  <Lightbulb />
                  <span>
                    摘要式写法会是 <s>{view.rollUp.naiveSummary}</s> ——只问指标是否达标，会把归因未被证明的部分一并算作已证明。
                  </span>
                </div>
              </div>
            </section>

            {/* 5 — the researcher's own words, never overwritten by model output */}
            {view.userJudgment && (
              <section className="rd-sec">
                <div className="rd-judgment">
                  <div className="rd-judgment-label">
                    <UserCheck />
                    我的研判
                    {view.userJudgmentCarriedFrom && (
                      <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>
                        · 自 {view.userJudgmentCarriedFrom} 结转
                      </span>
                    )}
                  </div>
                  <p>{view.userJudgment}</p>
                </div>
              </section>
            )}

            {/* Rejection reasons are not listed again here: each argument row
                above already carries its own gate verdict and reasoning, so a
                second list would only repeat it in different words. */}
          </div>
        </div>
      )}
    </article>
  );
};

/* ------------------------------------------------------------------ */

const ArgumentLine: React.FC<{
  claim: AtomicClaim;
  av: ArgumentVersion | undefined;
  admitted: boolean;
  onOpenEvidence: (argumentId: string) => void;
}> = ({ claim, av, admitted, onOpenEvidence }) => {
  if (!av) {
    return (
      <div className="rd-arg">
        <span className="rd-arg-mark is-pending">
          <SUPPORT.PENDING.Icon />
        </span>
        <div className="rd-arg-main">
          <div className="rd-arg-text">{claim.statement}</div>
          <p className="rd-arg-gate">本轮资料未涉及该论据。</p>
        </div>
      </div>
    );
  }

  const support = SUPPORT[av.supportLevel];
  const SupportIcon = support.Icon;
  const signal = SIGNAL[av.interimSignal];
  const numeric = av.numeric;

  return (
    <div className={`rd-arg${admitted ? " is-admitted" : ""}`}>
      <span className={support.mark} title={`${support.label} · ${support.admitted}`}>
        <SupportIcon />
      </span>

      <div className="rd-arg-main">
        <div className="rd-arg-text">
          {claim.statement}
          {numeric &&
            (numeric.result === null ? (
              <>
                {" · "}
                <button
                  type="button"
                  className="fig is-refused"
                  onClick={() => onOpenEvidence(claim.argumentId)}
                  title={numeric.refusalReason}
                >
                  拒绝计算
                </button>
              </>
            ) : (
              <>
                {" · 实测 "}
                <button
                  type="button"
                  className="fig"
                  onClick={() => onOpenEvidence(claim.argumentId)}
                  title={`${numeric.formulaId} · 点击查看计算链与原文`}
                >
                  {numeric.resultDisplay}
                </button>
              </>
            ))}
        </div>
        <p className="rd-arg-gate">
          <b>{admitted ? "已采纳" : "不采纳"}</b>
          {" · "}
          {av.gateReason}
          {av.interimSignal !== "UNKNOWN" && ` · 阶段信号：${signal.label}`}
        </p>
      </div>

      <span className={support.tag}>{support.label}</span>
    </div>
  );
};
