import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Database,
  FlaskConical,
  Layers,
  Scale,
  ShieldAlert,
  ShieldOff,
  Sparkles,
} from "lucide-react";
import { PHILOSOPHY_DEMO, DEMO_VERSION_IDS, LATEST_DEMO_VERSION } from "./philosophyDemo";
import { VersionTimeline } from "./VersionTimeline";
import { ThesisBoard } from "./ThesisBoard";
import { ArgumentTree } from "./ArgumentTree";
import { ArgumentDetail } from "./ArgumentDetail";
import { StateLedger } from "./StateLedger";
import { Tag } from "./primitives";

/**
 * 产品哲学演示 (Philosophy Demo)
 * ==============================
 * ISOLATION: this component tree lives entirely under `src/demo/`. It imports
 * nothing from `src/server/**` or the real research components, performs no
 * `fetch`, creates no project, and writes no Research Memory. It renders a
 * frozen, synthetic scenario so the three pillars can be examined without a
 * model key, without uploads, and without any chance of polluting real state.
 */

const PILLAR_ICONS = [Layers, Scale, ShieldAlert] as const;

export const PhilosophyDemoApp: React.FC = () => {
  const demo = PHILOSOPHY_DEMO;
  const [activeVersion, setActiveVersion] = useState<string>(LATEST_DEMO_VERSION);
  const [selectedThesisId, setSelectedThesisId] = useState<string>(demo.theses[0].thesisId);
  const [selectedArgumentId, setSelectedArgumentId] = useState<string | null>(null);
  const [pillarsOpen, setPillarsOpen] = useState(true);

  const versionIndex = Math.max(0, DEMO_VERSION_IDS.indexOf(activeVersion));
  const version = demo.versions[versionIndex];
  const previous = versionIndex > 0 ? demo.versions[versionIndex - 1] : null;

  const thesis = useMemo(
    () => demo.theses.find((t) => t.thesisId === selectedThesisId) || demo.theses[0],
    [demo.theses, selectedThesisId],
  );
  const thesisView = thesis.versions[activeVersion];

  /* Default the deep dive to the argument that best teaches the pillar:
     prefer one that was NOT admitted, since that is where the gate is visible. */
  useEffect(() => {
    if (!thesisView) return;
    const rejected = thesisView.rollUp.rejected[0]?.argumentId;
    const first = thesis.claims.find((c) => c.versions[activeVersion])?.argumentId ?? null;
    setSelectedArgumentId(rejected || first);
  }, [activeVersion, selectedThesisId, thesis.claims, thesisView]);

  const selectedClaim = thesis.claims.find((c) => c.argumentId === selectedArgumentId) || thesis.claims[0];

  return (
    <div className="min-h-screen bg-[#f6f8fc] pb-10">
      {/* ---------------- header ---------------- */}
      <header className="sticky top-0 z-40 border-b border-[#e1e7f0] bg-white/94 backdrop-blur-md">
        <div className="mx-auto flex min-h-[64px] w-[min(1500px,calc(100%-40px))] items-center justify-between gap-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-blue-600 text-white shadow-[0_6px_14px_rgba(24,90,219,0.2)]">
              <FlaskConical className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="text-[15px] font-bold tracking-[-0.015em] text-slate-900">FinTrust</span>
                <span className="rounded border border-[#d7e3f5] px-1.5 py-[2px] text-[10px] font-semibold text-[#42648e]">
                  产品哲学演示
                </span>
              </div>
              <p className="mt-[3px] text-[11px] leading-tight text-[#718198]">
                三条设计原则如何在同一份研究状态上同时成立
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 text-[11px] text-[#5f718a]">
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-800">
              <ShieldOff className="h-3 w-3" />
              合成数据 · 非真实披露
            </span>
            <span className="hidden items-center gap-1 rounded-md border border-[#dfe7f1] bg-white px-2 py-1 md:inline-flex">
              <Database className="h-3 w-3 text-blue-600" />
              只读 · 无网络 · 不写研究记忆
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-[min(1500px,calc(100%-40px))] space-y-4 pt-5">
        {/* ---------------- hero + subject ---------------- */}
        <section className="grid gap-3 lg:grid-cols-[1.55fr_1fr]">
          <div className="rounded-xl border border-[#d7e3f1] bg-white p-5 shadow-[0_6px_22px_rgba(18,44,82,0.055)]">
            <span className="ft-eyebrow">
              <Sparkles className="h-3 w-3" /> PHILOSOPHY DEMO
            </span>
            <h1 className="mt-3 text-[clamp(22px,2.5vw,31px)] font-extrabold leading-[1.18] tracking-[-0.04em] text-slate-900">
              不是一份更好的摘要，
              <br />
              而是一套<span className="text-blue-600">可回溯、可拒绝、可追责</span>的研究状态。
            </h1>
            <p className="mt-3 max-w-[640px] text-[13px] leading-[1.85] text-[#62758f]">
              这个演示用一家公司的三个报告期，完整走一遍产品的三条原则：状态如何跨期演进、数字与语义如何各自独立出具结论、
              以及一条论述如何被拆到论据——并且只有拿到强事实支撑的论据，才被允许参与最终判定。
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <Tag className="border-[#d6e2f2] bg-[#f3f7fd] px-2 py-1 text-[11px] font-semibold text-[#3569b2]">
                {demo.meta.company}
              </Tag>
              <Tag className="border-[#d6e2f2] bg-[#f3f7fd] px-2 py-1 font-mono text-[11px] text-[#3569b2]">
                {demo.meta.securityCode}.{demo.meta.exchange}
              </Tag>
              <Tag className="border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                {demo.meta.industry}
              </Tag>
              <Tag className="border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                {demo.meta.accountingStandard} · {demo.meta.defaultScope}
              </Tag>
            </div>
          </div>

          <div className="rounded-xl border border-[#d7e3f1] bg-white p-5 shadow-[0_6px_22px_rgba(18,44,82,0.055)]">
            <div className="mb-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              演示对象与期间
            </div>
            <div className="grid grid-cols-3 gap-2">
              {demo.versions.map((v) => {
                const filing = v.documents.find((d) => d.role === "FINANCIAL_FILING");
                const isActive = v.version === activeVersion;
                return (
                  <div
                    key={v.version}
                    className={`rounded-lg border px-2.5 py-2 ${
                      isActive ? "border-blue-400 bg-blue-50/60" : "border-slate-200 bg-slate-50/60"
                    }`}
                  >
                    <div className="font-mono text-[10px] font-bold text-slate-400">{v.version}</div>
                    <div className="mt-0.5 text-[11px] font-semibold leading-snug text-slate-800">
                      {filing ? filing.period.split("（")[0] : "研报基线"}
                    </div>
                    <div className="mt-1 text-[9.5px] leading-snug text-slate-400">
                      {v.documents.length} 份资料 · {v.modelCalls.count} 次模型调用
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-2 text-[10.5px] leading-relaxed text-amber-900/80">
              <ShieldAlert className="mt-[1px] h-3 w-3 shrink-0 text-amber-600" />
              <span>{demo.meta.dataNote}</span>
            </p>
          </div>
        </section>

        {/* ---------------- three pillars ---------------- */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,33,63,0.04)]">
          <button
            type="button"
            onClick={() => setPillarsOpen((o) => !o)}
            className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-left"
            aria-expanded={pillarsOpen}
          >
            <span className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                三条产品哲学
              </span>
              <span className="text-[11px] text-slate-400">每条都对应下方工作台里一个可点的证据</span>
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${pillarsOpen ? "rotate-180" : ""}`}
            />
          </button>

          {pillarsOpen && (
            <div className="grid gap-px border-t border-slate-100 bg-slate-100 lg:grid-cols-3">
              {demo.pillars.map((p, i) => {
                const Icon = PILLAR_ICONS[i] || Layers;
                return (
                  <article key={p.id} className="bg-white px-4 py-3.5">
                    <div className="flex items-start gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#cfe0fb] bg-[#edf4ff] text-blue-600">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] font-bold text-slate-300">{p.index}</span>
                          <h3 className="text-[13px] font-bold leading-snug text-slate-900">{p.title}</h3>
                        </div>
                        <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-600">{p.claim}</p>
                      </div>
                    </div>
                    <div className="mt-2.5 space-y-1.5">
                      <p className="rounded-md bg-slate-50 px-2.5 py-2 text-[10.5px] leading-relaxed text-slate-600">
                        <span className="font-bold text-slate-700">在这里看到：</span>
                        {p.howItShows}
                      </p>
                      <p className="rounded-md border border-rose-100 bg-rose-50/50 px-2.5 py-2 text-[10.5px] leading-relaxed text-rose-900/70">
                        {p.antiPattern}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* ---------------- pillar 1: the state scrubber ---------------- */}
        <VersionTimeline versions={demo.versions} active={activeVersion} onSelect={setActiveVersion} />

        {/* ---------------- the state of all theses, right now ---------------- */}
        <section>
          <div className="mb-2 flex items-end justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">
                {activeVersion} 时点的全部论述状态
              </div>
              <h2 className="mt-0.5 text-[16px] font-extrabold tracking-[-0.02em] text-slate-900">
                {version.stateDelta.headline}
              </h2>
            </div>
            <span className="hidden shrink-0 font-mono text-[10px] text-slate-400 md:block">
              选择一张卡片进入论据级核验
            </span>
          </div>
          <ThesisBoard
            theses={demo.theses}
            activeVersion={activeVersion}
            selectedThesisId={thesis.thesisId}
            onSelectThesis={setSelectedThesisId}
          />
        </section>

        {/* ---------------- pillars 2 & 3: the workspace ---------------- */}
        {thesisView && (
          <section className="grid gap-3 2xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <ArgumentTree
              thesis={thesis}
              view={thesisView}
              activeVersion={activeVersion}
              selectedArgumentId={selectedClaim?.argumentId ?? null}
              onSelectArgument={setSelectedArgumentId}
            />
            {selectedClaim && <ArgumentDetail claim={selectedClaim} activeVersion={activeVersion} />}
          </section>
        )}

        {/* ---------------- pillar 1 continued: ledgers ---------------- */}
        <StateLedger version={version} previous={previous} />

        {/* ---------------- isolation contract ---------------- */}
        <section className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(16,33,63,0.04)]">
          <div className="flex items-start gap-2">
            <ShieldOff className="mt-[2px] h-4 w-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                演示与真实管线的隔离约定
              </h3>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-slate-600">
                本页面所有数据来自 <code className="rounded bg-slate-100 px-1 py-[1px] font-mono text-[10.5px] text-slate-700">src/demo/</code>{" "}
                下的静态合成装置。该目录不导入任何服务端模块、不发起网络请求、不创建项目、不写入 Research Memory；
                真实管线同样不导入本目录。隔离是结构性的，不依赖约定注释——因此演示无论如何操作都不会污染真实研究状态。
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                需要跑真实流程（上传研报 → 提炼论述 → 上传定期报告 → 核验）时，请切换到「真实研究工作台」标签页。
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default PhilosophyDemoApp;
