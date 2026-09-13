import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ReportFirstContainer } from "./components/research/ReportFirstContainer";
import { PhilosophyDemoApp } from "./demo/PhilosophyDemoApp";

/**
 * Two surfaces, deliberately kept apart.
 *
 *   产品哲学演示 — static, synthetic, read-only. Lives entirely under
 *     `src/demo/`: no network calls, no project creation, no Research Memory
 *     writes. It is the default surface because it explains the product without
 *     needing a model key or real filings.
 *   真实研究工作台 — the real V1 report-first pipeline, which uploads documents,
 *     calls the model and persists state.
 *
 * Only one is mounted at a time, so they never share component state. The
 * switch is a control inside the desk header rather than a chrome bar of its
 * own: two sticky headers stacked would spend the first screen on navigation
 * instead of research.
 */

type Surface = "demo" | "real";

export default function App() {
  const [surface, setSurface] = useState<Surface>("demo");

  if (surface === "demo") {
    return <PhilosophyDemoApp onOpenRealPipeline={() => setSurface("real")} />;
  }

  return (
    <div className="min-h-screen bg-[#f6f8fc] font-sans text-slate-900">
      <div className="sticky top-0 z-50 border-b border-[#dce5f0] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex w-[min(1440px,calc(100%-40px))] items-center gap-3 py-2">
          <button
            type="button"
            onClick={() => setSurface("demo")}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#d7e0ec] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#475569] transition-colors hover:border-[#9db7dc] hover:text-[#185adb]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回演示
          </button>
          <span className="text-[12px] font-semibold text-[#475569]">真实研究工作台</span>
          <span className="ml-auto rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10.5px] font-semibold text-amber-800">
            真实模式：会调用模型并写入研究记忆
          </span>
        </div>
      </div>

      <ReportFirstContainer />

      <footer className="app-footer">
        <span>FinTrust V1 · 用户确认优先，证据位置可追溯</span>
        <span>Research Memory 以本地 Markdown 状态跨轮继承</span>
      </footer>
    </div>
  );
}
