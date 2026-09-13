import React from "react";
import { Ban, Check, Quote, Scale, Search, ShieldAlert, X } from "lucide-react";
import type { AtomicClaim, ArgumentVersion } from "./types";
import { ATTRIBUTION, MATURITY, RELATION, SIGNAL, STATUS, SUPPORT } from "./meta";
import { Drawer } from "./Drawer";

/**
 * The verification chain behind one figure.
 *
 * This is the internal machinery, and it lives here rather than on the desk
 * because it is what a number is *made of*, not what the number says. It is
 * organised as the three layers the verification actually runs in, so opening it
 * reads as an audit rather than as two competing panels:
 *
 *   1 来源真实性  — does the citation exist, on that page, in those words
 *   2 可比性与计算 — are the operands comparable, and what did the code compute
 *   3 命题关系    — does the evidence support, refute, or merely relate
 *
 * Each layer reaches its own conclusion before the next one runs, and the
 * composition at the bottom states the rule it applied.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  claim: AtomicClaim | null;
  av: ArgumentVersion | null;
  version: string;
}

export const EvidenceDrawer: React.FC<Props> = ({ open, onClose, claim, av, version }) => {
  if (!claim || !av) return null;

  const status = STATUS[av.status];
  const StatusIcon = status.Icon;
  const support = SUPPORT[av.supportLevel];
  const numeric = av.numeric;
  const semantic = av.semantic;
  const allChecksPassed = numeric ? numeric.checks.every((c) => c.passed) : true;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={claim.statement}
      sub={`${claim.argumentId} · ${version} · ${claim.kindLabel}`}
    >
      {/* Verdict up front: the analyst opened this to check a number */}
      <div
        className="rd-result"
        style={{ marginBottom: 4, alignItems: "center" }}
      >
        <div>
          <div className="rd-result-label">核验结论</div>
          <span className={status.pill} style={{ marginTop: 2 }}>
            <StatusIcon />
            {status.label}
            <code>{av.status}</code>
          </span>
        </div>
        <div className="rd-result-target">
          <div className="rd-result-label">支撑强度</div>
          <span className={support.tag} style={{ fontSize: 12, padding: "4px 9px" }}>
            {support.label} · {support.admitted}
          </span>
        </div>
      </div>
      <p className="rd-ev-path" style={{ marginTop: 10 }}>
        核验窗口{MATURITY[av.maturity].label}（{MATURITY[av.maturity].hint}）· 阶段信号
        {SIGNAL[av.interimSignal].label}
      </p>

      {/* ── Layer 1 ─────────────────────────────────────────── */}
      <section className="rd-layer">
        <div className="rd-layer-head">
          <span className="rd-layer-n">01</span>
          <h3>来源真实性</h3>
          <span className="rd-layer-note">引用是否存在、是否逐字、在哪一页</span>
        </div>

        {semantic && semantic.evidence.length > 0 ? (
          semantic.evidence.map((e, i) => (
            <div key={`${e.textHash}-${i}`} style={{ marginBottom: i === semantic.evidence.length - 1 ? 0 : 12 }}>
              <blockquote className="rd-ev-quote">
                <Quote
                  style={{ width: 13, height: 13, color: "var(--rd-text-3)", marginRight: 6, verticalAlign: -1 }}
                />
                {e.quote}
              </blockquote>
              <p className="rd-ev-path">
                {e.fileName} · 第 {e.page} 页
                {e.headingPath.length > 0 && ` · ${e.headingPath.join(" › ")}`}
                <br />
                文本指纹 {e.textHash} · 解析质量{" "}
                {e.quality === "NATIVE" ? "原生文本" : e.quality === "OCR_RELIABLE" ? "OCR 可靠" : "OCR 低置信"}
              </p>
            </div>
          ))
        ) : numeric ? (
          <p className="rd-ev-path" style={{ margin: 0 }}>
            本论据为纯数值命题，无叙述性引用；来源核验落在第二层的单元格定位上。
          </p>
        ) : (
          <div className="rd-empty">
            <Search style={{ width: 13, height: 13, verticalAlign: -2, marginRight: 5 }} />
            本轮资料包中不存在可引用的相关披露，记为缺证据而非推测。
          </div>
        )}
      </section>

      {/* ── Layer 2 ─────────────────────────────────────────── */}
      <section className="rd-layer">
        <div className="rd-layer-head">
          <span className="rd-layer-n">02</span>
          <h3>可比性与计算</h3>
          <span className="rd-layer-note">口径先过门禁，数字再由代码算</span>
        </div>

        {!numeric ? (
          <p className="rd-ev-path" style={{ margin: 0 }}>
            本论据不含数值条件，未进入计算层。
          </p>
        ) : (
          <>
            <pre className="rd-formula">
              {numeric.formulaId} v{numeric.formulaVersion} · {numeric.formula}
            </pre>

            <div className="rd-ops">
              {numeric.operands.map((op) => (
                <div className="rd-op" key={`${op.label}-${op.period}`}>
                  <div style={{ minWidth: 0 }}>
                    <div className="rd-op-label">{op.label}</div>
                    <div className="rd-op-where">
                      {op.period} · {op.scope}
                      <br />
                      {op.source.fileName} 第 {op.source.page} 页 · {op.source.locator}
                    </div>
                  </div>
                  <div className="rd-op-val">
                    {op.value}
                    <small>{op.unit}</small>
                  </div>
                </div>
              ))}
            </div>

            <div className="rd-checks">
              {numeric.checks.map((c) => (
                <span
                  key={c.code}
                  className={`rd-check ${c.passed ? "is-pass" : "is-fail"}`}
                  title={`${c.code} · ${c.explanation}`}
                >
                  {c.passed ? <Check /> : <X />}
                  {c.label}
                </span>
              ))}
            </div>

            {numeric.result === null ? (
              <div className="rd-refusal">
                <h4>
                  <Ban />
                  拒绝计算
                </h4>
                <p>{numeric.refusalReason}</p>
                <p style={{ marginTop: 8, opacity: 0.8 }}>
                  门禁未通过时，诚实的输出是一个拒绝理由，而不是一个看起来合理的数字。
                </p>
              </div>
            ) : (
              <div className="rd-result">
                <div>
                  <div className="rd-result-label">Decimal 计算结果</div>
                  <div className="rd-result-val">{numeric.resultDisplay}</div>
                </div>
                <div className="rd-result-target">
                  <div className="rd-result-label">核验门槛</div>
                  {numeric.targetDisplay}
                </div>
              </div>
            )}

            {numeric.gapDisplay && (
              <p className="rd-result-gap">
                <Scale style={{ width: 12, height: 12, verticalAlign: -1, marginRight: 5 }} />
                差额：{numeric.gapDisplay}
                <br />
                <span style={{ color: "var(--rd-text-3)", fontSize: 11.5 }}>
                  口径门禁{allChecksPassed ? "全部通过" : "存在未通过项"} · 原始值 {numeric.result}
                </span>
              </p>
            )}
          </>
        )}
      </section>

      {/* ── Layer 3 ─────────────────────────────────────────── */}
      <section className="rd-layer">
        <div className="rd-layer-head">
          <span className="rd-layer-n">03</span>
          <h3>命题关系</h3>
          <span className="rd-layer-note">支持、反驳、仅相关，还是缺信息</span>
        </div>

        {!semantic ? (
          <p className="rd-ev-path" style={{ margin: 0 }}>
            本轮未调用语义通道：{av.gateReason}
          </p>
        ) : (
          <>
            <p className="rd-ev-path" style={{ marginTop: 0, marginBottom: 12 }}>
              判定：<strong style={{ color: "var(--rd-ink)" }}>{RELATION[semantic.relation]?.label ?? semantic.relation}</strong>
            </p>

            {semantic.attributions.map((a, i) => {
              const meta = ATTRIBUTION[a.kind];
              return (
                <div key={i} className={meta?.className ?? "rd-attr"}>
                  <span className="rd-attr-kind">
                    {meta?.label ?? a.kind} · {a.label}
                  </span>
                  <p>{a.text}</p>
                  {meta && <p className="rd-attr-note">{meta.note}</p>}
                </div>
              );
            })}

            <div className="rd-adversarial">
              <q>{semantic.adversarialCheck.asked}</q>
              {semantic.adversarialCheck.findings.length > 0 && (
                <ul>
                  {semantic.adversarialCheck.findings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              )}
              <p className="rd-attr-note" style={{ marginTop: 8 }}>
                {semantic.adversarialCheck.agreed
                  ? "两次判定一致。"
                  : "两次判定不一致 → 保留较谨慎的状态，并记录争议。"}
              </p>
            </div>
          </>
        )}
      </section>

      {/* ── Composition ─────────────────────────────────────── */}
      {av.composition && (
        <section className="rd-layer">
          <div className="rd-layer-head">
            <span className="rd-layer-n">→</span>
            <h3>合成</h3>
            <span className="rd-layer-note">各层独立出结论后按规则合成</span>
          </div>
          <div className="rd-verdict-box">
            <span>适用规则</span>
            <p>{av.composition.rule}</p>
          </div>
          {av.composition.tension && (
            <div className="rd-tension">
              <span>
                <ShieldAlert style={{ width: 11, height: 11, verticalAlign: -1, marginRight: 4 }} />
                值得注意
              </span>
              <p>{av.composition.tension}</p>
            </div>
          )}
          <p className="rd-ev-path" style={{ marginTop: 12 }}>
            准入门禁：{av.gateReason}
          </p>
        </section>
      )}

      {av.nextQuestion && (
        <section className="rd-layer">
          <div className="rd-layer-head">
            <span className="rd-layer-n">?</span>
            <h3>该论据仍欠一个问题</h3>
          </div>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.75, color: "var(--rd-text-2)" }}>
            {av.nextQuestion.text}
            <br />
            <span className="rd-ev-path">所需证据：{av.nextQuestion.requiredEvidence}</span>
          </p>
        </section>
      )}
    </Drawer>
  );
};
