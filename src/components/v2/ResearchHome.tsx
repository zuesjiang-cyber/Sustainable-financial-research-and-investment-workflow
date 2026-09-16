import React, { useMemo, useState } from "react";
import { Bell, Building2, FileText, Loader2, Radio, Search, Sparkles, Upload } from "lucide-react";
import { uploadResearchReport } from "../research/uploadClient";
import { v2 } from "./api";

export const ResearchHome: React.FC<{
  projects: any[];
  notifications: any[];
  health: any | null;
  onOpenProject: (id: string) => void;
  onCreated: (projectId: string, runId: string) => void;
  onRefresh: () => void;
  onOpenNotification: (item: any) => void;
}> = ({ projects, notifications, health, onOpenProject, onCreated, onRefresh, onOpenNotification }) => {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unread = notifications.filter((item) => !item.readAt);
  const checking = useMemo(() => projects.filter((item) => item.monitoring).length, [projects]);

  const submit = async () => {
    if (!text.trim() && !url.trim() && !documentId) {
      setError("请输入判断、粘贴材料、提供网页链接，或上传 PDF");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await v2<any>("/v2/research", {
        method: "POST",
        headers: { "Idempotency-Key": `ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
        body: JSON.stringify({ text: text.trim(), url: url.trim() || undefined, documentId: documentId || undefined }),
      });
      setText("");
      setUrl("");
      setDocumentId(null);
      setPdfName(null);
      onCreated(result.projectId, result.runId);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="v2-home">
      <section className="v2-hero">
        <span className="ft-eyebrow"><Sparkles className="h-3.5 w-3.5" /> 持续研究</span>
        <h1>输入观点或材料，研究在离开页面后继续。</h1>
        <p>先给出观点概括与初步判断，再在后台核验官方披露与外部原文。只有你明确表达，才会改写用户立场；转发材料不会自动变成你的观点。</p>
      </section>

      {health?.coverageNotes?.length > 0 && (
        <div className="inline-alert is-info">
          <strong>覆盖不足，产品范围不缩小</strong>
          <p>{health.coverageNotes.join("；")}</p>
        </div>
      )}

      <section className="v2-composer ft-card">
        <textarea
          className="ft-input v2-composer-input"
          placeholder="例如：我长期看好圣邦股份模拟芯片竞争力。也可以粘贴研报片段、公告链接，或先上传 PDF。"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={5}
        />
        <div className="v2-composer-row">
          <input className="ft-input" placeholder="可选：网页链接" value={url} onChange={(event) => setUrl(event.target.value)} />
          <label className="ft-btn-soft v2-file-label">
            <Upload className="h-4 w-4" />
            {pdfName ? pdfName : "上传 PDF"}
            <input
              type="file"
              accept="application/pdf"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setBusy(true);
                setError(null);
                try {
                  const receipt = await uploadResearchReport(file, { role: "THESIS_SOURCE" });
                  setDocumentId(receipt.uploadId);
                  setPdfName(file.name);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "PDF 上传失败");
                } finally {
                  setBusy(false);
                  event.target.value = "";
                }
              }}
            />
          </label>
          <button type="button" className="ft-btn-primary" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            开始研究
          </button>
        </div>
        {documentId && <p className="v2-composer-hint"><FileText className="h-3.5 w-3.5" /> 已解析 PDF，作为用户材料进入研究，不会自动改写立场。</p>}
        {error && <div className="inline-alert is-error">{error}</div>}
        <div className="v2-composer-hint">
          文字 / 链接 / PDF · 模糊观点可以保留，不必先建完整投资框架
        </div>
      </section>

      <section className="v2-home-grid">
        <div className="ft-card v2-panel">
          <div className="v2-panel-head">
            <h2><Building2 className="h-4 w-4" /> 已跟踪公司</h2>
            <span>{checking} / {health?.maxTrackedCompanies || 5}</span>
          </div>
          {projects.length === 0 && <p className="v2-empty">还没有真实研究项目。回放案例不会出现在这里。</p>}
          <ul className="v2-project-list">
            {projects.map((project) => (
              <li key={project.id}>
                <button type="button" onClick={() => onOpenProject(project.id)}>
                  <strong>{project.company?.name || project.title}</strong>
                  <span>{project.company?.securityCode || project.identityStatus} · {project.stance || "尚未形成用户立场"} · 线索 {project.unverifiedLeads}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="ft-card v2-panel">
          <div className="v2-panel-head">
            <h2><Bell className="h-4 w-4" /> 重要变化</h2>
            <span>{unread.length} 未读</span>
          </div>
          {notifications.slice(0, 8).map((item) => (
            <button key={item.id} type="button" className="v2-note-item" onClick={() => onOpenNotification(item)}>
              <strong>{item.kind === "DAILY_DIGEST" ? "每日摘要 · " : item.kind === "CORRECTION" ? "更正 · " : ""}{item.title}</strong>
              <p>{item.body}</p>
            </button>
          ))}
          {notifications.length === 0 && <p className="v2-empty">暂无已核实的重要提醒。未核实线索不会出现在这里。</p>}
        </div>
        <div className="ft-card v2-panel">
          <div className="v2-panel-head">
            <h2><Radio className="h-4 w-4" /> 检查状态</h2>
          </div>
          <p className="v2-status-line">服务运行期间后台检查 {checking} 家已识别公司；停机不记为成功，恢复后从上次成功点往前重叠 7 天补查。</p>
          <p className="v2-status-line">官方披露默认每 30 分钟；外部观点每日两次。线索 1 / 6 / 24 小时再查，不会升格为事实。</p>
          <p className="v2-status-line">预算 {health?.budget?.spentCny ?? 0} / {health?.budget?.monthlyBudgetCny ?? 80} 元 · 模型 {health?.llm_configured ? "已连接" : "未连接"} · Tavily {health?.tavily_configured ? "已连接" : "未连接"}</p>
        </div>
      </section>
    </div>
  );
};
