import React from "react";
import { Activity, FileText, ShieldCheck, Sparkles } from "lucide-react";
import { V2Workspace } from "./components/v2/V2Workspace";
import "./v2.css";

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
                <span className="app-brand-product">Continuous Research</span>
              </div>
              <p className="app-brand-caption">输入观点或材料 · 后台核验 · 重要变化提醒 · 下一轮继承</p>
            </div>
          </div>
          <div className="app-header-meta">
            <span className="app-header-chip">
              <FileText className="h-3.5 w-3.5" />
              SQLite 为运行依据
            </span>
            <span className="app-header-model">
              <Sparkles className="h-3.5 w-3.5" />
              快速 / 研究 / 复核
            </span>
            <span className="app-header-status"><Activity className="h-3.5 w-3.5" /> V2</span>
          </div>
        </div>
      </header>
      <main>
        <V2Workspace />
      </main>
      <footer className="app-footer">
        <span>FinTrust V2 · 用户立场与 AI 分析分离，未核实线索不进入事实评估</span>
        <span>默认跟踪 5 家沪深公司 · 历史回放与真实研究隔离</span>
      </footer>
    </div>
  );
}
