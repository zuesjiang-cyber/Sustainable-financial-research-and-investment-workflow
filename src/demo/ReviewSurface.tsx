import React, { useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  FileQuestion,
  Fingerprint,
  Lightbulb,
  Scale,
  ShieldCheck,
  X,
} from "lucide-react";
import type { ResearchVersion, RoundFindings, Thesis } from "./types";
import { FACT_KIND, INFERENCE_STRENGTH, NATURE, STATUS, VERDICT, splitCriterion } from "./meta";
import { findingsKey, FINDINGS, inferenceIsWellFormed, partitionFindings } from "./findings";

/**
 * 画面二 — the analysis result, awaiting the user.
 *
 * Everything the round produced, split in two and never blended:
 *
 *   事实    binary. Holds or does not. Carries a reason when it fails, an
 *           evidence-nature tag always, and a door to the page it came from.
 *           The user is not asked to take a position on a fact.
 *   推论    the model's judgement, labelled as such on every single line, and
 *           required to carry 依据 / 局限 / 缺口. An inference that cannot is
 *           not rendered — `inferenceIsWellFormed` filters it out and the count
 *           shown to the user reflects what survived.
 *   未涉及  a coverage statement. Not a fact, not an inference: a declaration
 *           that nothing was re-verified here.
 *
 * The user's job on this surface is narrow and deliberate: accept, or write
 * their own judgement alongside. They are not asked to adjudicate arithmetic.
 */

type Decision = "PENDING" | "ACCEPTED" | "JUDGED";

interface Props {
  version: ResearchVersion;
  theses: Thesis[];
  onOpenEvidence: (argumentId: string) => void;
  onConfirm: (judgments: Record<string, string>) => void;
  onCancel: () => void;
}

export const ReviewSurface: React.FC<Props> = ({
  version,
  theses,
  onOpenEvidence,
  onConfirm,
  onCancel,
}) => {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [judgments, setJudgments] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      theses
        .map((thesis) => {
          const view = thesis.versions[version.version];
          const raw = FINDINGS[findingsKey(thesis.thesisId, version.version)];
          if (!view || !raw) return null;
          /* Partitioned here, once. Nothing downstream sees the raw round, so
             no part of this surface can render a verdict the evidence nature
             does not permit. */
          return { thesis, view, round: partitionFindings(raw) };
        })
        .filter((r) => r !== null),
    [theses, version.version],
  );

  /* Only well-formed inferences are shown or counted; demotions are counted
     separately because they are the cap firing, not the model hedging. */
  const totals = useMemo(() => {
    let facts = 0;
    let holds = 0;
    let inferences = 0;
    let demoted = 0;
    let dropped = 0;
    for (const r of rows) {
      facts += r.round.facts.length;
      holds += r.round.facts.filter((f) => f.verdict === "HOLDS").length;
      demoted += r.round.demoted.length;
      const good = r.round.inferences.filter(inferenceIsWellFormed);
      inferences += good.length;
      dropped += r.round.inferences.length - good.length;
    }
    return { facts, holds, inferences, demoted, dropped };
  }, [rows]);

  const pending = rows.filter((r) => (decisions[r.thesis.thesisId] ?? "PENDING") === "PENDING").length;
  const filing = version.documents.find((d) => d.role === "FINANCIAL_FILING");

  return (
    <div className="rv">
      <header className="rv-head">
        <div className="rv-head-main">
          <p className="rv-kicker">分析完成 · 待你确认</p>
          <h2>{version.trigger}</h2>
          <p className="rv-meta">
            {filing ? `${filing.fileName} · ${filing.period}` : version.label} · 命中 {rows.length} /{" "}
            {theses.length} 条观点
          </p>
        </div>
        <dl className="rv-tally">
          <div>
            <dt>事实</dt>
            <dd>
              {totals.facts}
              <span>
                成立 {totals.holds} · 不成立 {totals.facts - totals.holds}
              </span>
            </dd>
          </div>
          <div>
            <dt>推论</dt>
            <dd>
              {totals.inferences}
              <span>
                {totals.demoted > 0
                  ? `含 ${totals.demoted} 条因证据性质降级`
                  : "均标注依据、局限与缺口"}
              </span>
            </dd>
          </div>
        </dl>
      </header>

      <div className="rv-list">
        {rows.map(({ thesis, view, round }) => {
          const id = thesis.thesisId;
          const decision = decisions[id] ?? "PENDING";
          const status = STATUS[view.status];
          const StatusIcon = status.Icon;
          const { title, criterion } = splitCriterion(thesis.currentStatement);
          const goodInferences = round.inferences.filter(inferenceIsWellFormed);

          return (
            <section key={id} className={`rv-card${decision === "PENDING" ? "" : " is-settled"}`}>
              <div className="rv-card-head">
                <div className="rv-card-title">
                  <h3>{title}</h3>
                  {/* The criterion is restated on this surface, not only on the
                      desk: a verdict without its rule invites the user to
                      re-argue the rule instead of reading the evidence. */}
                  {criterion && <p className="rv-criterion">核验门槛：{criterion}</p>}
                </div>
                <span className={status.pill} title={view.status}>
                  <StatusIcon />
                  {status.label}
                </span>
              </div>

              {round.demoted.length > 0 && (
                <div className="rv-cap">
                  <Fingerprint />
                  <div>
                    <strong>证据性质上限已生效</strong>
                    <p>
                      {round.demoted.length} 条数值判定来自
                      {Array.from(new Set(round.demoted.map((d) => NATURE[d.fact.nature].label))).join("、")}
                      ，该性质不能使事实成立，已降级为推论。
                    </p>
                  </div>
                </div>
              )}

              {round.notTouched && (
                <div className="rv-untouched">
                  <FileQuestion />
                  <div>
                    <strong>本次未涉及</strong>
                    <p>{round.notTouched}</p>
                  </div>
                </div>
              )}

              {/* ── 事实 ── */}
              <div className="rv-block">
                <div className="rv-block-head">
                  <Scale />
                  事实
                  <span className="rv-block-count">{round.facts.length}</span>
                  <span className="rv-block-note">二元判定，无需你表态</span>
                </div>
                <ul className="rv-facts">
                  {round.facts.map((fact, i) => {
                    const verdict = VERDICT[fact.verdict];
                    const nature = NATURE[fact.nature];
                    const argument = fact.argumentId
                      ? thesis.claims.find((c) => c.argumentId === fact.argumentId)
                      : undefined;
                    const numeric = argument?.versions[version.version]?.numeric;
                    return (
                      <li key={i} className={`rv-fact ${verdict.className}`}>
                        <span className="rv-fact-mark" title={verdict.label}>
                          {fact.verdict === "HOLDS" ? <Check /> : <X />}
                        </span>
                        <div className="rv-fact-main">
                          <p className="rv-fact-statement">
                            {fact.statement}
                            {numeric && numeric.result !== null && (
                              <button
                                type="button"
                                className="fig"
                                onClick={() => onOpenEvidence(fact.argumentId!)}
                                title="查看计算链与原文"
                              >
                                {numeric.resultDisplay}
                              </button>
                            )}
                            {numeric && numeric.result === null && (
                              <button
                                type="button"
                                className="fig is-refused"
                                onClick={() => onOpenEvidence(fact.argumentId!)}
                                title={numeric.refusalReason}
                              >
                                拒绝计算
                              </button>
                            )}
                          </p>
                          {fact.failReason && <p className="rv-fact-why">{fact.failReason}</p>}
                          <p className="rv-fact-meta">
                            <span className={`rv-nature ${nature.className}`}>{nature.label}</span>
                            <span className="rv-fact-kind">{FACT_KIND[fact.kind]}</span>
                            {fact.source ? (
                              <span className="rv-fact-src">
                                {fact.source.fileName} 第 {fact.source.page} 页 · {fact.source.locator}
                              </span>
                            ) : (
                              <span className="rv-fact-src">本轮资料包中无对应披露</span>
                            )}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* ── 推论 ── */}
              <div className="rv-block">
                <div className="rv-block-head">
                  <Lightbulb />
                  推论
                  <span className="rv-block-count">{goodInferences.length}</span>
                  <span className="rv-block-note">模型的判断，不是事实</span>
                </div>
                {goodInferences.length === 0 ? (
                  <p className="rv-none">
                    本轮没有可支撑推论的事实，因此不产出推论。
                  </p>
                ) : (
                  <ul className="rv-inferences">
                    {goodInferences.map((inf, i) => {
                      const strength = INFERENCE_STRENGTH[inf.strength];
                      return (
                        <li key={i} className={`rv-inference ${strength.className}`}>
                          <div className="rv-inference-tag">
                            推论
                            <span>{strength.label}</span>
                          </div>
                          <p className="rv-inference-text">{inf.text}</p>
                          <dl className="rv-inference-parts">
                            <div>
                              <dt>依据</dt>
                              <dd>{inf.basis}</dd>
                            </div>
                            <div>
                              <dt>局限</dt>
                              <dd>{inf.limitation}</dd>
                            </div>
                            <div>
                              <dt>缺口</dt>
                              <dd>{inf.gap}</dd>
                            </div>
                          </dl>
                          {inf.natureCaveat && (
                            <p className="rv-caveat">
                              <Fingerprint />
                              {inf.natureCaveat}
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* ── 用户处理 ── */}
              <div className="rv-actions">
                {decision === "PENDING" ? (
                  editing === id ? (
                    <div className="rv-judge-edit">
                      <textarea
                        autoFocus
                        value={judgments[id] ?? ""}
                        placeholder="写下你的判断。它与系统结论并存，不会被模型输出覆盖，并结转到后续每一轮。"
                        onChange={(e) => setJudgments((p) => ({ ...p, [id]: e.target.value }))}
                      />
                      <div className="rv-judge-btns">
                        <button
                          type="button"
                          className="rv-btn is-primary"
                          disabled={!judgments[id]?.trim()}
                          onClick={() => {
                            setDecisions((p) => ({ ...p, [id]: "JUDGED" }));
                            setEditing(null);
                          }}
                        >
                          记下我的判断
                        </button>
                        <button type="button" className="rv-btn" onClick={() => setEditing(null)}>
                          取消
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="rv-btn is-primary"
                        onClick={() => setDecisions((p) => ({ ...p, [id]: "ACCEPTED" }))}
                      >
                        <ShieldCheck />
                        接受本轮结果
                      </button>
                      <button type="button" className="rv-btn" onClick={() => setEditing(id)}>
                        写下我的判断
                      </button>
                    </>
                  )
                ) : (
                  <p className="rv-decided">
                    {decision === "ACCEPTED" ? (
                      <>
                        <ShieldCheck /> 已接受本轮结果
                      </>
                    ) : (
                      <>
                        <ChevronRight /> 已记下你的判断：{judgments[id]}
                      </>
                    )}
                    <button
                      type="button"
                      className="rv-undo"
                      onClick={() => {
                        setDecisions((p) => ({ ...p, [id]: "PENDING" }));
                        setEditing(id);
                      }}
                    >
                      修改
                    </button>
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <footer className="rv-foot">
        <p className="rv-foot-note">
          机器出草稿，你做最终解释。确认后才写入研究状态；未确认的内容不会改变任何历史版本。
        </p>
        <div className="rv-foot-btns">
          <button type="button" className="rv-btn" onClick={onCancel}>
            返回研究台
          </button>
          <button
            type="button"
            className="rv-btn is-primary"
            disabled={pending > 0}
            onClick={() => onConfirm(judgments)}
            title={pending > 0 ? `还有 ${pending} 条观点未处理` : "确认并写入新状态"}
          >
            保存本次研究{pending > 0 ? `（还有 ${pending} 条待处理）` : ""}
          </button>
        </div>
      </footer>
    </div>
  );
};
