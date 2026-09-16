import React, { useMemo, useState } from "react";
import { ArrowLeft, BellOff, History, Loader2, MessageSquare, RefreshCw, Search } from "lucide-react";
import { v2 } from "./api";

export const CompanyResearchPage: React.FC<{
  project: any;
  run: any | null;
  onBack: () => void;
  onOpenEvidence: (id: string) => void;
  onRefresh: () => void;
}> = ({ project, run, onBack, onOpenEvidence, onRefresh }) => {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [deepQuestion, setDeepQuestion] = useState("");
  const latestRun = run || project.runs?.[0];
  const gapQuestion = useMemo(() => {
    const q = latestRun?.preliminary?.openQuestions?.[0];
    return q || `针对 ${project.company?.name || "该公司"}，目前最重要的证据缺口是什么？`;
  }, [latestRun, project.company]);

  const send = async () => {
    if (!message.trim()) return;
    setBusy(true);
    try {
      await v2(`/v2/projects/${project.id}/messages`, { method: "POST", body: JSON.stringify({ text: message }) });
      setMessage("");
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const startDeep = async () => {
    setBusy(true);
    try {
      await v2(`/v2/projects/${project.id}/research-runs`, { method: "POST", body: JSON.stringify({ kind: "DEEP", question: deepQuestion || gapQuestion }) });
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const markRead = async (id: string) => {
    await v2(`/v2/notifications/${id}/read`, { method: "POST", body: "{}" });
    onRefresh();
  };

  const chooseCompany = async (candidate: any) => {
    await v2(`/v2/projects/${project.id}/company`, { method: "POST", body: JSON.stringify(candidate) });
    onRefresh();
  };

  return (
    <div className="v2-company">
      <button type="button" className="ft-btn-ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" /> 返回首页</button>
      <header className="v2-company-hero ft-card">
        <div>
          <div className="research-company-tags">
            {project.company && <span className="research-company-tag">{project.company.securityCode}</span>}
            <span className="research-version-tag">{project.identityStatus}</span>
            {project.isReplay && <span className="research-confirmed-tag">历史回放 · {project.replayAsOf}</span>}
          </div>
          <h1>{project.company?.name || project.title}</h1>
          <p>{project.summary}</p>
        </div>
        <div className="research-header-actions">
          <button type="button" className="ft-btn-soft" onClick={() => v2(`/v2/projects/${project.id}/research-runs`, { method: "POST", body: JSON.stringify({ kind: "BACKGROUND" }) }).then(onRefresh)}>
            <RefreshCw className="h-4 w-4" /> 手动检查
          </button>
        </div>
      </header>

      {latestRun?.preliminary && (
        <section className="v2-prelim ft-card">
          <span className="ft-eyebrow">第一屏</span>
          <h2>{latestRun.preliminary.headline}</h2>
          <p>{latestRun.preliminary.summary}</p>
          <div className="v2-prelim-cols">
            <div><strong>得到支持</strong>{latestRun.preliminary.supported.length ? latestRun.preliminary.supported.map((item: string) => <p key={item}>{item}</p>) : <p>尚无已核实支持</p>}</div>
            <div><strong>需要修正</strong>{latestRun.preliminary.needsRevision.length ? latestRun.preliminary.needsRevision.map((item: string) => <p key={item}>{item}</p>) : <p>尚无已核实修正</p>}</div>
            <div><strong>正在核实</strong>{latestRun.preliminary.openQuestions.map((item: string) => <p key={item}>{item}</p>)}</div>
          </div>
          {latestRun.coverage && (
            <p className="v2-coverage">官方披露 {latestRun.coverage.official} · 外部 {latestRun.coverage.external} · 模型 {latestRun.modelCalls}/{latestRun.limits?.modelCalls} · 资料 {latestRun.documentsRead}/{latestRun.limits?.documents}{latestRun.coverage.notes?.[0] ? ` · ${latestRun.coverage.notes[0]}` : ""}</p>
          )}
          {latestRun.events?.filter((item: any) => item.phase === "tool").slice(-6).map((item: any) => (
            <p key={item.seq} className="v2-tool-line">工具 · {item.message}</p>
          ))}
        </section>
      )}

      {project.identityStatus !== "IDENTIFIED" && project.companyCandidates?.length > 0 && (
        <section className="ft-card v2-panel">
          <h2>请确认公司身份后才开始自动跟踪</h2>
          <div className="v2-candidate-row">
            {project.companyCandidates.map((item: any) => (
              <button key={item.securityCode} type="button" className="ft-btn-soft" onClick={() => chooseCompany(item)}>
                {item.name} {item.securityCode}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="v2-company-grid">
        <article className="ft-card v2-panel">
          <h2>用户立场</h2>
          {project.currentStance ? (
            <>
              <p className="v2-quote">{project.currentStance.rawText}</p>
              <p>理由：{project.currentStance.reasons.join("；") || "（用户未展开）"}</p>
              <p>观察阈值：{project.currentStance.thresholds.length ? project.currentStance.thresholds.map((t: any) => `${t.metric}${t.op}${t.value}`).join("；") : "（空，用户未定义）"}</p>
            </>
          ) : <p className="v2-empty">没有用户持有的立场。转发材料不会自动变成你的观点。</p>}
        </article>
        <article className="ft-card v2-panel">
          <h2>材料观点</h2>
          {project.materialViews?.length ? project.materialViews.map((view: any) => (
            <p key={view.id}><strong>{view.author}</strong>：{view.text}</p>
          )) : <p className="v2-empty">暂无独立材料观点。</p>}
        </article>
        <article className="ft-card v2-panel">
          <h2>未解决风险 / 线索</h2>
          {project.leads?.filter((item: any) => item.status === "OPEN").length
            ? project.leads.filter((item: any) => item.status === "OPEN").map((lead: any) => (
              <p key={lead.id}>{lead.text}<em> · 下次 {lead.nextCheckAt?.slice(0, 16)?.replace("T", " ")} · 第 {lead.attempts + 1} 次</em></p>
            ))
            : <p className="v2-empty">暂无未核实线索。线索按 1/6/24 小时再查，不会因为“提早提醒”变成事实。</p>}
        </article>
        <article className="ft-card v2-panel">
          <h2>外部主要看法</h2>
          <p className="v2-empty">检索到的主要看法按作者与时间保留；样本不足时不宣称市场共识。</p>
          {project.analyses?.slice(-4).map((item: any) => (
            <p key={item.id}>{item.text}</p>
          ))}
        </article>
      </section>

      <section className="ft-card v2-panel">
        <div className="v2-panel-head"><h2><History className="h-4 w-4" /> 事件与证据</h2></div>
        <ul className="v2-event-list">
          {project.events?.map((event: any) => (
            <li key={event.id}>
              <button type="button" onClick={() => event.evidenceIds?.[0] && onOpenEvidence(event.evidenceIds[0])}>
                <span className={`v2-pill v2-pill-${event.verification.toLowerCase()}`}>{event.verification}</span>
                <strong>{event.description}</strong>
                <em>{event.stage} · 披露 {event.disclosedAt || "—"}</em>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="ft-card v2-panel">
        <h2><Search className="h-4 w-4" /> 深入研究</h2>
        <p>默认围绕当前最重要的缺口。达到 12 次模型 / 24 份资料后交付部分结果与未决问题，不标成完成。估值只在具备价格日期、财务口径和必要假设后进行。</p>
        <div className="v2-composer-row">
          <input className="ft-input" value={deepQuestion} placeholder={gapQuestion} onChange={(event) => setDeepQuestion(event.target.value)} />
          <button type="button" className="ft-btn-primary" onClick={startDeep} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} 启动深入研究
          </button>
        </div>
      </section>

      <section className="ft-card v2-panel">
        <h2><MessageSquare className="h-4 w-4" /> 你的新想法</h2>
        <textarea className="ft-input v2-composer-input" rows={3} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="用自然语言修正理由或范围。未提交的旧分析会对照最新立场。" />
        <button type="button" className="ft-btn-success" onClick={send} disabled={busy}>保存原话并进入下一轮</button>
      </section>

      <section className="ft-card v2-panel">
        <h2>提醒</h2>
        {(project.notifications || []).map((item: any) => (
          <div key={item.id} className="v2-note-item">
            <strong>{item.title}</strong>
            <p>{item.body}</p>
            {!item.readAt && (
              <button type="button" className="ft-btn-ghost" onClick={() => markRead(item.id)}>
                <BellOff className="h-3.5 w-3.5" /> 知道了，继续跟踪
              </button>
            )}
          </div>
        ))}
      </section>
    </div>
  );
};
