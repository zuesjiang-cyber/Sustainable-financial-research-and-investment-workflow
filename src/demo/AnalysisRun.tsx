import React, { useEffect, useRef, useState } from "react";
import { FileSearch, SkipForward } from "lucide-react";

/**
 * 画面一 — the analysis animation.
 *
 * The correction that shaped this file: 不需要看着机器干活，只需要在最终输出的
 * 时候可以溯源。So this is an animation, not a trace. No evidence stream, no
 * tool payloads, no token counts, no stage chips turning into a log.
 *
 * One concession to honesty, and it is load-bearing: beneath the animation a
 * single real line names the stage actually running. Without it this is a fake
 * spinner, and a product whose whole claim is traceability cannot open with one.
 * The line is one line — it does not grow.
 *
 * Progress is drawn as discrete segments, one per real stage, and a segment only
 * changes state at a stage boundary. There is no smoothed percentage and no
 * invented time remaining, because neither is known. The rings and the pulse
 * carry the sense that something is alive; the segments carry only what is true.
 */

interface Stage {
  label: string;
  /** The single honest line shown while this stage runs. */
  detail: string;
  ms: number;
}

/**
 * The seven stages a round actually passes through. They are real divisions of
 * the work, not decoration: each one names a gate the pipeline has to clear,
 * which is why the last one is "生成差异" — the round ends by comparing against
 * confirmed state, not by writing prose.
 */
export const ANALYSIS_STAGES: Stage[] = [
  { label: "冻结资料包", detail: "记录发布时点与文件指纹，锁定本轮可比范围", ms: 900 },
  { label: "对齐已有观点", detail: "按观点身份匹配；未命中的观点不会被重新验证", ms: 1100 },
  { label: "重要性预筛", detail: "判断这份披露是否触及已有观点的指标或命题", ms: 1000 },
  { label: "抽取事实", detail: "取出数值与原句，逐条绑定页码、期间与口径", ms: 1500 },
  { label: "逐条核验", detail: "口径门禁通过后由代码计算，模型只判断命题关系", ms: 2200 },
  { label: "强弱判定", detail: "区分事实与推论；证据性质决定事实能否成立", ms: 1300 },
  { label: "生成差异", detail: "与上一轮已确认状态对比，产出待你确认的草稿", ms: 1100 },
];

interface Props {
  /** The round headline, e.g. 「2025 年三季报到达」. */
  trigger: string;
  /** Name of the disclosure being analysed, so the wait has a subject. */
  disclosureTitle: string;
  onDone: () => void;
}

export const AnalysisRun: React.FC<Props> = ({ trigger, disclosureTitle, onDone }) => {
  /* `stage === ANALYSIS_STAGES.length` means finished. */
  const [stage, setStage] = useState(0);
  const done = stage >= ANALYSIS_STAGES.length;
  const current = done ? ANALYSIS_STAGES[ANALYSIS_STAGES.length - 1] : ANALYSIS_STAGES[stage];
  const advance = useRef(onDone);
  advance.current = onDone;

  useEffect(() => {
    let cancelled = false;
    let index = 0;

    /* A chained timeout rather than an interval: each stage owns its own
       duration, so the bar can never drift ahead of the work it represents. */
    const runNext = () => {
      if (cancelled || index >= ANALYSIS_STAGES.length) return;
      const wait = ANALYSIS_STAGES[index].ms;
      setTimeout(() => {
        if (cancelled) return;
        index += 1;
        setStage(index);
        if (index >= ANALYSIS_STAGES.length) {
          // A beat of stillness before the handoff, so the result does not
          // appear to pop out of a running animation.
          setTimeout(() => !cancelled && advance.current(), 420);
        } else {
          runNext();
        }
      }, wait);
    };
    runNext();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="ar">
      <div className="ar-head">
        <p className="ar-kicker">{done ? "分析完成" : "正在分析"}</p>
        <h2>
          {trigger}
          <span className="ar-live">演示回放</span>
        </h2>
        <p className="ar-src">
          资料包 <b>{disclosureTitle}</b>
        </p>
      </div>

      {/* The animation: three counter-rotating arcs around a page being read.
          Abstract by design — it depicts attention, not data. */}
      <div className="ar-stage" aria-hidden="true">
        <span className="ar-ring a" />
        <span className="ar-ring b" />
        <span className="ar-ring c" />
        <span className="ar-core">
          <span className="ar-sweep" />
          <span className="ar-core-icon">
            <FileSearch />
          </span>
        </span>
      </div>

      {/* The one real line. role="status" so a screen reader gets the stage and
          not the decoration. */}
      <div className="ar-line" role="status" aria-live="polite">
        <p className="ar-line-main">
          <span className="ar-dot" aria-hidden="true" />
          {done ? "已产出事实与推论" : current.label}
        </p>
        <p className="ar-line-sub">{done ? "结果需要你的判断才会写入研究状态" : current.detail}</p>
      </div>

      {/* Discrete segments, one per real stage. */}
      <div className="ar-bar" aria-hidden="true">
        {ANALYSIS_STAGES.map((s, i) => (
          <span
            key={s.label}
            className={`ar-seg${i < stage ? " on" : ""}${i === stage && !done ? " now" : ""}`}
          />
        ))}
      </div>

      <div className="ar-foot">
        <button type="button" className="ar-skip" onClick={onDone} disabled={done}>
          <SkipForward />
          跳到结果
        </button>
        <p className="ar-note">
          预编排演示，非实时模型调用。真正的溯源在下一步：每条事实都带页码与口径，每条推论都带依据、局限与缺口。
        </p>
      </div>
    </div>
  );
};
