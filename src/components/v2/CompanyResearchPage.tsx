import React, { useMemo, useState } from "react";
import { ArrowLeft, BellOff, Download, History, Loader2, MessageSquare, RefreshCw, Search } from "lucide-react";
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
  const [priceDate, setPriceDate] = useState("");
  const [scope, setScope] = useState("CONSOLIDATED");
  const [assumptions, setAssumptions] = useState("");
  const [valuation, setValuation] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const latestRun = run || project.runs?.[0];
  const gapQuestion = useMemo(() => {
    const q = latestRun?.preliminary?.openQuestions?.[0];
    return q || `针对 ${project.company?.name || "该公司"}，目前最重要的证据缺口是什么？`;
  }, [latestRun, project.company]);
  const openLeads = (project.leads || []).filter((item: any) => item.status === "OPEN");
  const toolEvents = (latestRun?.events || []).filter((item: any) => item.phase === "tool" || item.phase === "background" || item.phase === "preliminary");

  const send = async () => {
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await v2(`/v2/projects/${project.id}/messages`, { method: "POST", body: JSON.stringify({ text: message }) });
      setMessage("");
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  };

  const startDeep = async () => {
    setBusy(true);
    setError(null);
    try {
      await v2(`/v2/projects/${project.id}/research-runs`, { method: "POST", body: JSON.stringify({ kind: "DEEP", question: deepQuestion || gapQuestion }) });
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "深入研究启动失败");
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

  const exportMd = async () => {
    const result = await v2<any>(`/v2/projects/${project.id}/export`, { method: "POST", body: "{}" });
    setError(null);
    alert(`已导出可再生成的 Markdown：${result.file}`);
  };

  const runValuation = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await v2(`/v2/projects/${project.id}/valuation`, {
        method: "POST",
        body: JSON.stringify({
          priceDate,
          accountingScope: scope,
          assumptions: assumptions.split("\n").map((item) => item.trim()).filter(Boolean),
        }),
      });
      setValuation(result);
    } catch (err) {
      setValuation(null);
      setError(err instanceof Error ? err.message : "估值被拒绝");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="v2-company">
      <div className="v2-company-toolbar">
        <button type="button" className="ft-btn-ghost" onClick={onBack}><ArrowLeft className="h-4 w-4" /> 返回首页</button>
        <div className="research-header-actions">
          <button type="button" className="ft-btn-soft" onClick={() => v2(`/v2/projects/${project.id}/research-runs`, { method: "POST", body: JSON.stringify({ kind: "BACKGROUND" }) }).then(onRefresh)}>
            <RefreshCw className="h-4 w-4" /> 手动检查
          </button>
          <button type="button" className="ft-btn-soft" onClick={exportMd}><Download className="h-4 w-4" /> 导出 Markdown</button>
        </div>
      </div>

      <header className="v2-company-hero ft-card">
        <div>
          <div className="research-company-tags">
            {project.company && <span className="research-company-tag">{project.company.securityCode}</span>}
            <span className="research-version-tag">{project.identityStatus}</span>
            {project.isReplay && <span className="research-confirmed-tag">历史回放 · {project.replayAsOf}</span>}
            {project.monitoring?.enabled ? <span className="research-confirmed-tag">跟踪中</span> : <span className="research-version-tag">未自动跟踪</span>}
          </div>
          <h1>{project.company?.name || project.title}</h1>
          <p>{project.summary}</p>
        </div>
      </header>

      {error && <div className="inline-alert is-error">{error}</div>}

      {latestRun?.preliminary && (
        <section className="v2-prelim ft-card">
          <span className="ft-eyebrow">第一屏 · {latestRun.status}</span>
          <h2>{latestRun.preliminary.headline}</h2>
          <p>{latestRun.preliminary.summary}</p>
          <div className="v2-prelim-cols">
            <div><strong>得到支持</strong>{latestRun.preliminary.supported.length ? latestRun.preliminary.supported.map((item: string) => <p key={item}>{item}</p>) : <p>尚无已核实支持</p>}</div>
            <div><strong>需要修正</strong>{latestRun.preliminary.needsRevision.length ? latestRun.preliminary.needsRevision.map((item: string) => <p key={item}>{item}</p>) : <p>尚无已核实修正</p>}</div>
            <div><strong>正在核实</strong>{latestRun.preliminary.openQuestions.map((item: string) => <p key={item}>{item}</p>)}</div>
          </div>
          {latestRun.coverage && (
            <p className="v2-coverage">官方 {latestRun.coverage.official} · 外部 {latestRun.coverage.external} · 模型 {latestRun.modelCalls}/{latestRun.limits?.modelCalls} · 资料 {latestRun.documentsRead}/{latestRun.limits?.documents}</p>
          )}
          {latestRun.coverage?.notes?.map((note: string) => <p key={note} className="v2-tool-line">{note}</p>)}
          {toolEvents.slice(-8).map((item: any) => (
            <p key={item.seq} className="v2-tool-line">#{item.seq} {item.phase} · {item.message}</p>
          ))}
        </section>
      )}

      {project.identityStatus !== "IDENTIFIED" && (
        <section className="ft-card v2-panel">
          <h2>请确认公司身份后才开始自动跟踪</h2>
          <p className="v2-empty">身份未唯一确认时，系统不会启动官方披露巡检，避免串公司。</p>
          <div className="v2-candidate-row">
            {(project.companyCandidates || []).map((item: any) => (
              <button key={item.securityCode} type="button" className="ft-btn-soft" onClick={() => chooseCompany(item)}>
                {item.name} {item.securityCode} · {item.reason}
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
              <p>观察阈值：{project.currentStance.thresholds.length ? project.currentStance.thresholds.map((t: any) => `${t.metric}${t.op}${t.value}`).join("；") : "（空，用户未定义，系统不编造）"}</p>
              <p className="v2-empty">版本 v{project.currentStance.version} · {project.currentStance.changeReason || "首次表达"}</p>
            </>
          ) : <p className="v2-empty">没有用户持有的立场。转发材料不会自动变成你的观点。</p>}
        </article>
        <article className="ft-card v2-panel">
          <h2>材料观点</h2>
          {project.materialViews?.length ? project.materialViews.map((view: any) => (
            <p key={view.id}><strong>{view.author}</strong>：{view.text}<em> · 不代表用户认可</em></p>
          )) : <p className="v2-empty">暂无独立材料观点。</p>}
        </article>
        <article className="ft-card v2-panel">
          <h2>未核实线索</h2>
          {openLeads.length
            ? openLeads.map((lead: any) => (
              <p key={lead.id}>{lead.text}<em> · 下次 {String(lead.nextCheckAt || "").slice(0, 16).replace("T", " ")} · 第 {lead.attempts + 1} 次</em></p>
            ))
            : <p className="v2-empty">暂无未核实线索。即使打开“提早提醒”，线索也不会升格为事实。</p>}
        </article>
        <article className="ft-card v2-panel">
          <h2>外部主要看法</h2>
          <p className="v2-empty">按作者与时间保留；样本不足时不宣称市场共识。Tavily 综合答案不得当证据。</p>
          {project.analyses?.slice(-5).map((item: any) => (
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
                <span className={`v2-pill v2-pill-${String(event.verification).toLowerCase()}`}>{event.verification}</span>
                <strong>{event.description}</strong>
                <em>{event.stage} · 发生 {event.occurredAt || "—"} · 披露 {event.disclosedAt || "—"}</em>
              </button>
            </li>
          ))}
        </ul>
        {!project.events?.length && <p className="v2-empty">后台核验完成后，已核实与被拦截的事件会出现在这里。</p>}
      </section>

      <section className="ft-card v2-panel">
        <h2><Search className="h-4 w-4" /> 深入研究</h2>
        <p>默认围绕当前最大缺口。达到 12 次模型 / 24 份资料后交付部分结果与未决问题，不标成完成。</p>
        <div className="v2-composer-row">
          <input className="ft-input" value={deepQuestion} placeholder={gapQuestion} onChange={(event) => setDeepQuestion(event.target.value)} />
          <button type="button" className="ft-btn-primary" onClick={startDeep} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} 启动深入研究
          </button>
        </div>
      </section>

      <section className="ft-card v2-panel">
        <h2>估值前提</h2>
        <p className="v2-empty">只有同时具备价格日期、会计口径和必要假设后才接受估值请求；缺少任一项直接拒绝，不给点估计。</p>
        <div className="v2-composer-row">
          <input className="ft-input" type="date" value={priceDate} onChange={(event) => setPriceDate(event.target.value)} />
          <select className="ft-input" value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="CONSOLIDATED">合并口径</option>
            <option value="PARENT">母公司口径</option>
            <option value="SEGMENT">分部分口</option>
          </select>
        </div>
        <textarea className="ft-input v2-composer-input" rows={3} value={assumptions} onChange={(event) => setAssumptions(event.target.value)} placeholder="每行一条必要假设，例如：永续增长率不超过名义 GDP；资本成本来自用户给定。" />
        <button type="button" className="ft-btn-soft" onClick={runValuation} disabled={busy}>检查估值前提</button>
        {valuation && <p className="v2-quote">{valuation.reason}</p>}
      </section>

      <section className="ft-card v2-panel">
        <h2><MessageSquare className="h-4 w-4" /> 你的新想法</h2>
        <textarea className="ft-input v2-composer-input" rows={3} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="用自然语言修正理由或范围。系统先保存原话；未提交的旧分析会对照最新立场。" />
        <button type="button" className="ft-btn-success" onClick={send} disabled={busy}>保存原话并进入下一轮</button>
      </section>

      <section className="ft-card v2-panel">
        <h2>跟踪与提醒</h2>
        <label className="v2-toggle">
          <input type="checkbox" checked={Boolean(project.monitoring?.enabled)} onChange={async (event) => { await v2(`/v2/projects/${project.id}/monitoring`, { method: "PATCH", body: JSON.stringify({ enabled: event.target.checked }) }); onRefresh(); }} disabled={project.isReplay || project.identityStatus !== "IDENTIFIED"} />
          自动跟踪（回放项目禁用）
        </label>
        <label className="v2-toggle">
          <input type="checkbox" checked={Boolean(project.monitoring?.earlyLeadAlerts)} onChange={async (event) => { await v2(`/v2/projects/${project.id}/monitoring`, { method: "PATCH", body: JSON.stringify({ earlyLeadAlerts: event.target.checked }) }); onRefresh(); }} />
          提早提醒未核实线索（仍不升格为事实）
        </label>
        <label className="v2-toggle">
          <input type="checkbox" checked={Boolean(project.monitoring?.browserNotify)} onChange={async (event) => {
            if (event.target.checked && typeof Notification !== "undefined") await Notification.requestPermission();
            await v2(`/v2/projects/${project.id}/monitoring`, { method: "PATCH", body: JSON.stringify({ browserNotify: event.target.checked }) });
            onRefresh();
          }} />
          浏览器通知（仅已核实重要变化）
        </label>
        <p className="v2-empty">上次官方成功 {project.monitoring?.lastOfficialSuccessAt || "尚未成功"} · 上次摘要 {project.monitoring?.lastDigestAt || "无"}</p>
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
        {!(project.notifications || []).length && <p className="v2-empty">暂无提醒。</p>}
      </section>
    </div>
  );
};
