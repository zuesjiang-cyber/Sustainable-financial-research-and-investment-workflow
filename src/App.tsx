import React from "react";
import { Activity, FileText, ShieldCheck, Sparkles } from "lucide-react";
import { ReportFirstContainer } from "./components/research/ReportFirstContainer";

/**
 * FinTrust V1 has one clear entry point: a report-first research workspace.
 * The legacy test bench and the older SQLite demo shell are intentionally not
 * exposed here; the real V1 workflow remains inside ReportFirstContainer.
 */
export default function App() {
  return (
    <div className="min-h-screen bg-[#f6f8fc] text-slate-900 font-sans">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand">
            <div className="app-brand-mark"><ShieldCheck className="h-5 w-5" /></div>
            <div>
              <div className="app-brand-name">
                <span>FinTrust</span>
                <span className="app-brand-product">Research Workspace</span>
              </div>
              <p className="app-brand-caption">研报观点持续核验 · 面向分析师的研究记忆工作台</p>
            </div>
          </div>

          <div className="app-header-meta">
            <span className="app-header-chip">
              <FileText className="h-3.5 w-3.5" />
              Markdown Research Memory
            </span>
            <span className="app-header-model">
              <Sparkles className="h-3.5 w-3.5" />
              Ling-3.0-Flash-Fin
            </span>
            <span className="app-header-status"><Activity className="h-3.5 w-3.5" /> V1</span>
          </div>
        </div>
      </header>

      <main>
        <ReportFirstContainer />
      </main>

      <footer className="app-footer">
        <span>FinTrust V1 · 用户确认优先，证据位置可追溯</span>
        <span>Research Memory 以本地 Markdown 状态跨轮继承</span>
      </footer>
    </div>
  );
}
