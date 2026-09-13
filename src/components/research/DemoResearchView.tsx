import React, { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  Download,
  FileText,
  History,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  MessageSquare,
  BookOpen,
  AlertCircle,
} from "lucide-react";
import {
  DEMO_RESEARCH,
  DEMO_STATUS_META,
  type DemoResearchStatus,
} from "../../data/demoResearch";
import {
  confirmDemo,
  demoDraft,
  DEMO_MEMORY_KEY,
  initialDemoVersion,
  restoreDemo,
  type DemoJudgment,
} from "../../lib/demoMemory";
import "./demoWorkspace.css";

export const DemoResearchView: React.FC<{ onBackHome: () => void }> = ({
  onBackHome,
}) => {
  const [history, setHistory] = useState(() => {
    try {
      return restoreDemo(localStorage.getItem(DEMO_MEMORY_KEY));
    } catch {
      return [initialDemoVersion()];
    }
  });
  const [selected, setSelected] = useState("demo-cashflow");
  const [view, setView] = useState<number | null>(null);
  const [draft, setDraft] = useState<DemoJudgment[] | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [notice, setNotice] = useState("");
  const latest = history[history.length - 1];
  const snapshot = view === null ? latest : history[view];
  const items = draft || snapshot.items;
  const source = DEMO_RESEARCH.items.find((item) => item.id === selected)!;
  const judgment = items.find((item) => item.id === selected)!;
  const previous = latest.items.find((item) => item.id === selected)!;
  const hasFiling = !!draft || snapshot.version > 0;
  const statusKeys = Object.keys(DEMO_STATUS_META) as DemoResearchStatus[];
  const patch = (change: Partial<DemoJudgment>) =>
    setDraft(
      (current) =>
        current?.map((item) =>
          item.id === selected ? { ...item, ...change } : item,
        ) || null,
    );
  const save = () => {
    if (!draft) return;
    const next = confirmDemo(history, draft);
    setHistory(next);
    setDraft(null);
    setView(null);
    try {
      localStorage.setItem(DEMO_MEMORY_KEY, JSON.stringify(next));
      setNotice(`T${next.length - 1} 已确认。判断与修正已保存在本浏览器。`);
    } catch {
      setNotice("本轮已确认，但浏览器存储不可用；请导出备份，刷新后可能丢失。");
    }
  };
  const begin = () => {
    setView(null);
    setDraft(demoDraft(latest));
    setNotice(
      latest.version === 0
        ? "已载入预置财报核验草稿。请检查证据，修改判断后确认。"
        : "已继承上轮判断，开始复核演练。没有新增财报事实，请勿视为新的实证核验。",
    );
  };
  const exportMemory = () => {
    const text = [
      "# FinTrust · 演示研究记忆",
      "> 示例数据，非实时分析，不构成投资建议。后续复核沿用同一份示例财报。",
      ...history.map(
        (version) =>
          `\n## T${version.version} · ${version.confirmedAt}\n` +
          version.items
            .map(
              (item) =>
                `### ${DEMO_RESEARCH.items.find((s) => s.id === item.id)!.title}\n- 状态：${DEMO_STATUS_META[item.status].label}\n- 研究员判断：${item.note || "未填写"}\n- 下一步：${item.question}`,
            )
            .join("\n\n"),
      ),
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/markdown;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "FinTrust-Demo-Memory.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const reset = () => {
    if (
      !window.confirm(
        "重置演示将清除本浏览器中的 Demo 修正与版本历史。是否继续？",
      )
    )
      return;
    setHistory([initialDemoVersion()]);
    setView(null);
    setDraft(null);
    setNotice("演示已重置为 T0。");
    try {
      localStorage.removeItem(DEMO_MEMORY_KEY);
    } catch {
      setNotice("浏览器存储不可用，无法清除旧备份。");
    }
  };
  return (
    <div className="mw">
      <nav className="mw-top">
        <button onClick={onBackHome}>
          <ArrowLeft size={15} /> 返回首页
        </button>
        <span>
          <span className="mw-dot" /> 交互演示 <i /> 本地独立沙盒
        </span>
        <button onClick={reset}>
          <RotateCcw size={14} /> 重置演示
        </button>
      </nav>
      <header className="mw-hero">
        <div>
          <div className="mw-eyebrow">RESEARCH THAT REMEMBERS</div>
          <h1>
            每一个判断，都有迹可循<span>。</span>
          </h1>
          <p>用新证据回看旧观点，让每次修正成为下一轮研究的起点。</p>
          <div className="mw-company">
            <strong>圣邦股份</strong>
            <span>300661.SZ</span>
            <i /> 模拟研究档案 <span className="mw-pill">6 条持续跟踪观点</span>
          </div>
        </div>
        <div className="mw-memory-icon">
          <BookOpen size={34} />
          <span>RESEARCH MEMORY</span>
          <strong>
            T{latest.version}
            <small>已确认版本</small>
          </strong>
        </div>
      </header>
      <div className="mw-disclaimer">
        <ShieldCheck size={16} />
        <span>
          示例内容仅用于体验流程，未进行实时模型调用或原件核验。修改仅保存在本浏览器，不影响真实项目。
        </span>
      </div>
      <section className="mw-timeline" aria-label="研究版本时间线">
        <div className="mw-timeline-label">
          <History size={18} />
          <strong>研究时间线</strong>
          <small>选择版本，回看当时的判断</small>
        </div>
        <div className="mw-versions">
          {history.map((v) => (
            <button
              key={v.version}
              disabled={!!draft}
              onClick={() => setView(v.version)}
              className={
                !draft && snapshot.version === v.version ? "active" : ""
              }
            >
              <span>
                <Check size={12} /> T{v.version}
              </span>
              <strong>
                {v.version === 0
                  ? "原始观点"
                  : v.version === 1
                    ? "财报核验"
                    : "研究员复核"}
              </strong>
              <small>
                {v.version === 0 ? "已建立基线" : "已确认 · 可回看"}
              </small>
            </button>
          ))}
          {draft && (
            <button className="active is-draft">
              <span>
                <Sparkles size={12} /> T{history.length}
              </span>
              <strong>待确认草稿</strong>
              <small>尚未写入 Memory</small>
            </button>
          )}
        </div>
      </section>
      <section className="mw-round">
        <div>
          <span className="mw-eyebrow">
            {draft ? "REVIEW & CONFIRM" : "CONFIRMED RESEARCH"}
          </span>
          <h2>
            {draft
              ? "新一轮判断，由你确认"
              : snapshot.version === 0
                ? "先记住，我们为什么相信"
                : `T${snapshot.version} · 保存当时的判断，而不是覆盖过去`}
          </h2>
          <p>
            {hasFiling
              ? "收入增长获得支持，现金流质量值得重新审视。逐条核对证据，保留不同意见。"
              : "6 条投资观点已建立基线。载入示例财报，看看哪些判断得到支持，哪些需要修正。"}
          </p>
        </div>
        {!draft && (
          <button className="mw-primary" onClick={begin}>
            <Sparkles size={16} />
            {latest.version === 0 ? "载入示例财报核验" : "开启下一轮复核"}
            <ArrowRight size={16} />
          </button>
        )}
      </section>
      <div className="mw-stats">
        <button
          className={filter === "ALL" ? "active" : ""}
          onClick={() => setFilter("ALL")}
        >
          <span>全部观点</span>
          <strong>06</strong>
          <small>持续追踪，不丢失历史</small>
        </button>
        {statusKeys.map((status) => (
          <button
            key={status}
            className={`${DEMO_STATUS_META[status].className} ${filter === status ? "active" : ""}`}
            onClick={() => setFilter(status)}
          >
            <span>
              <b /> {DEMO_STATUS_META[status].label}
            </span>
            <strong>
              {String(items.filter((i) => i.status === status).length).padStart(
                2,
                "0",
              )}
            </strong>
            <small>
              {status === "UNRESOLVED"
                ? "缺少证据，保留问题"
                : status === "WEAKENED"
                  ? "重新审视原有逻辑"
                  : status === "PARTIALLY_SUPPORTED"
                    ? "方向成立，仍有偏差"
                    : "达到本轮核验条件"}
            </small>
          </button>
        ))}
      </div>
      <div className="mw-workspace">
        <aside className="mw-theses">
          <div className="mw-panel-title">
            <strong>观点清单</strong>
            <span>
              {
                items.filter((i) => filter === "ALL" || i.status === filter)
                  .length
              }{" "}
              条
            </span>
          </div>
          {items
            .filter((i) => filter === "ALL" || i.status === filter)
            .map((item) => {
              const original = DEMO_RESEARCH.items.find(
                (s) => s.id === item.id,
              )!;
              return (
                <button
                  key={item.id}
                  className={selected === item.id ? "selected" : ""}
                  onClick={() => setSelected(item.id)}
                >
                  <span className="mw-thesis-num">
                    THESIS{" "}
                    {String(
                      DEMO_RESEARCH.items.findIndex((s) => s.id === item.id) +
                        1,
                    ).padStart(2, "0")}
                    <ChevronRight size={14} />
                  </span>
                  <strong>{original.title}</strong>
                  <span
                    className={`mw-badge ${DEMO_STATUS_META[item.status].className}`}
                  >
                    {DEMO_STATUS_META[item.status].label}
                  </span>
                  {item.note && (
                    <small>
                      <MessageSquare size={12} /> 已保留研究员判断
                    </small>
                  )}
                </button>
              );
            })}
          {!items.some((i) => filter === "ALL" || i.status === filter) && (
            <p className="mw-empty">本轮暂无此类观点。</p>
          )}
        </aside>
        <article className="mw-detail">
          <div className="mw-detail-head">
            <div>
              <span className="mw-eyebrow">
                {source.id.toUpperCase()} · 跨轮沿用同一观点
              </span>
              <h2>{source.title}</h2>
            </div>
            <span
              className={`mw-badge ${DEMO_STATUS_META[judgment.status].className}`}
            >
              {DEMO_STATUS_META[judgment.status].label}
            </span>
          </div>
          <div className="mw-comparison">
            <section>
              <span>
                <Target size={16} /> T0 · 原始投资观点
              </span>
              <p>{source.originalView}</p>
              <small>核验条件 / {source.gap.split("；")[0]}</small>
            </section>
            <section>
              <span>
                <FileText size={16} />{" "}
                {hasFiling ? "示例财报 · 披露事实" : "等待新一期财报"}
              </span>
              <p>
                {hasFiling
                  ? source.latestFact
                  : "观点是研究的起点，不是已经得到验证的结论。"}
              </p>
              <small>
                {hasFiling
                  ? `${source.evidence} · 示例位置，未连接原件`
                  : "载入示例财报后，查看事实与原判断的差距"}
              </small>
            </section>
          </div>
          {hasFiling && (
            <div className="mw-findings">
              <div>
                <span>01 / 差距</span>
                <p>{source.gap}</p>
              </div>
              <div>
                <span>02 / 解释</span>
                <p>
                  {source.reason}
                  <small>
                    预置演示解释，非本次模型生成或已核实的因果结论。
                  </small>
                </p>
              </div>
            </div>
          )}
          <section className="mw-judgment">
            <div className="mw-panel-title">
              <strong>
                <MessageSquare size={16} /> 研究员判断
              </strong>
              <span>
                {draft ? "可修改 · 确认后进入历史" : "已确认快照 · 只读"}
              </span>
            </div>
            {draft ? (
              <>
                <label>
                  本轮状态
                  <select
                    value={judgment.status}
                    onChange={(e) =>
                      patch({ status: e.target.value as DemoResearchStatus })
                    }
                  >
                    {statusKeys.map((s) => (
                      <option key={s} value={s}>
                        {DEMO_STATUS_META[s].label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  为什么保留或调整这个判断？
                  <textarea
                    maxLength={2000}
                    value={judgment.note}
                    onChange={(e) => patch({ note: e.target.value })}
                    placeholder="例如：现金流单期下滑尚不足以否定长期逻辑，但需要降低短期信心，关注回款情况。"
                  />
                </label>
                <label>
                  下一轮需要回答的问题
                  <input
                    maxLength={1000}
                    value={judgment.question}
                    onChange={(e) => patch({ question: e.target.value })}
                  />
                </label>
                <div className="mw-change">
                  上轮：{DEMO_STATUS_META[previous.status].label}
                  <ArrowRight size={13} /> 本轮：
                  {DEMO_STATUS_META[judgment.status].label}
                  {previous.note && <span>已继承上轮研究员判断</span>}
                </div>
              </>
            ) : (
              <>
                <p className="mw-saved-note">
                  {judgment.note ||
                    "尚未添加独立判断。开启核验或复核后，可以记录你与预置结论不同的看法。"}
                </p>
                <div className="mw-question">
                  <Target size={16} />
                  <div>
                    <small>下一轮研究问题</small>
                    <p>{judgment.question}</p>
                  </div>
                </div>
              </>
            )}
          </section>
          <section className="mw-item-history">
            <h3>
              <History size={16} /> 这条观点的判断历史
            </h3>
            {history
              .filter(
                (v) => v.version <= (draft ? latest.version : snapshot.version),
              )
              .map((v) => {
                const i = v.items.find((item) => item.id === selected)!;
                return (
                  <div key={v.version}>
                    <b>T{v.version}</b>
                    <div>
                      <strong>{DEMO_STATUS_META[i.status].label}</strong>
                      <p>
                        {i.note ||
                          (v.version === 0
                            ? "建立研究假设，等待财报核验。"
                            : "保留本轮判断，未补充独立意见。")}
                      </p>
                      <small>
                        {v.version === 0
                          ? v.confirmedAt
                          : new Date(v.confirmedAt).toLocaleString("zh-CN")}
                      </small>
                    </div>
                  </div>
                );
              })}
          </section>
        </article>
      </div>
      <footer className="mw-action">
        <div>
          <BookOpen size={22} />
          <div>
            <strong>
              {draft
                ? `确认后生成 T${history.length}，保留所有历史版本`
                : `Research Memory · ${history.length} 个已确认版本`}
            </strong>
            <small>
              {draft
                ? "请逐条审阅六条观点；未修改的观点将保留当前草稿判断。"
                : "浏览器本地保存 · 可导出 Markdown 备份 · 清除浏览器数据将丢失记录"}
            </small>
          </div>
        </div>
        <div>
          {draft ? (
            <>
              <button
                onClick={() => {
                  if (window.confirm("放弃本轮未确认修改？")) {
                    setDraft(null);
                    setNotice("已放弃草稿，历史版本保持不变。");
                  }
                }}
              >
                放弃草稿
              </button>
              <button className="mw-primary" onClick={save}>
                <CheckCheck size={17} /> 确认本轮 · 写入 Memory
              </button>
            </>
          ) : (
            <button onClick={exportMemory}>
              <Download size={16} /> 导出研究记忆
            </button>
          )}
        </div>
      </footer>
      {notice && (
        <div className="mw-notice" role="status">
          <AlertCircle size={16} />
          {notice}
          <button aria-label="关闭提示" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
    </div>
  );
};
