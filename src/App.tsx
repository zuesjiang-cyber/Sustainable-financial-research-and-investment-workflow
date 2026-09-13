import React, { useState } from "react";
import { Activity, FlaskConical, ShieldAlert, Upload } from "lucide-react";
import { ReportFirstContainer } from "./components/research/ReportFirstContainer";
import { PhilosophyDemoApp } from "./demo/PhilosophyDemoApp";

/**
 * Two surfaces, deliberately kept apart:
 *
 *   1. 产品哲学演示 — static, synthetic, read-only. Lives entirely under
 *      `src/demo/`; performs no network calls and writes no Research Memory.
 *   2. 真实研究工作台 — the real V1 report-first pipeline
 *      (`ReportFirstContainer`), which uploads documents, calls the model and
 *      persists state.
 *
 * The demo is the default surface because it explains the product's design
 * principles without requiring a model key or real filings. Switching tabs
 * unmounts the other surface, so the two never share component state.
 */

type Surface = "demo" | "real";

const TABS: Array<{ id: Surface; label: string; caption: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { id: "demo", label: "产品哲学演示", caption: "合成数据 · 只读", Icon: FlaskConical },
  { id: "real", label: "真实研究工作台", caption: "上传研报 · 写入记忆", Icon: Upload },
];

export default function App() {
  const [surface, setSurface] = useState<Surface>("demo");

  return (
    <div className="min-h-screen bg-[#f6f8fc] font-sans text-slate-900">
      {/* Surface switch — the only shared chrome between demo and real pipeline */}
      <div className="sticky top-0 z-50 border-b border-[#dce5f0] bg-[#eef2f8]/95 backdrop-blur-md">
        <div className="mx-auto flex w-[min(1500px,calc(100%-40px))] items-center gap-2 py-2">
          <div className="mr-1 hidden items-center gap-1.5 lg:flex">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#718198]">FinTrust</span>
            <span className="h-3 w-px bg-[#cbd5e1]" />
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-[#d7e0ec] bg-white p-1 shadow-[0_1px_2px_rgba(16,33,63,0.04)]">
            {TABS.map((t) => {
              const isActive = surface === t.id;
              const Icon = t.Icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSurface(t.id)}
                  aria-pressed={isActive}
                  className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-left transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white shadow-[0_2px_6px_rgba(24,90,219,0.25)]"
                      : "text-[#475569] hover:bg-[#f1f5f9]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="whitespace-nowrap">
                    <span className="block text-[12px] font-bold leading-tight">{t.label}</span>
                    <span
                      className={`block text-[9.5px] leading-tight ${isActive ? "text-white/75" : "text-[#8492a7]"}`}
                    >
                      {t.caption}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {surface === "real" ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10.5px] font-semibold text-amber-800">
                <ShieldAlert className="h-3 w-3" />
                真实模式：会调用模型并写入研究记忆
              </span>
            ) : (
              <span className="hidden items-center gap-1.5 rounded-md border border-[#dfe7f1] bg-white px-2 py-1 text-[10.5px] text-[#5f718a] md:inline-flex">
                <Activity className="h-3 w-3 text-blue-600" />
                演示与真实管线在代码层面互不导入
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Only one surface is mounted at a time */}
      {surface === "demo" ? <PhilosophyDemoApp /> : <ReportFirstContainer />}

      {surface === "real" && (
        <footer className="app-footer">
          <span>FinTrust V1 · 用户确认优先，证据位置可追溯</span>
          <span>Research Memory 以本地 Markdown 状态跨轮继承</span>
        </footer>
      )}
    </div>
  );
}
