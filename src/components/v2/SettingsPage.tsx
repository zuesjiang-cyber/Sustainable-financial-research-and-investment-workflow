import React, { useEffect, useState } from "react";
import { KeyRound, Radio, Wallet } from "lucide-react";
import { v2 } from "./api";

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<any>(null);
  const [budget, setBudget] = useState("80");
  const [probe, setProbe] = useState<any>(null);
  const [importResult, setImportResult] = useState<any>(null);

  const load = async () => {
    const data = await v2<any>("/v2/settings");
    setSettings(data);
    setBudget(String(data.monthlyBudgetCny));
  };

  useEffect(() => { load().catch(() => undefined); }, []);

  return (
    <div className="v2-settings">
      <h1>连接与跟踪设置</h1>
      <p>密钥只保存在本地后端环境变量中，不会出现在浏览器。未连通时明确标注覆盖不足，而不是缩小产品承诺。</p>
      <section className="ft-card v2-panel">
        <h2><KeyRound className="h-4 w-4" /> 接口连接</h2>
        <p>模型：{settings?.llmConfigured ? "已配置" : "未配置，快速判断将只用本地规则并明确标注"}</p>
        <p>Tavily：{settings?.tavilyConfigured ? "已配置" : "未配置，外部发现覆盖不完整，不得把空检索写成共识"}</p>
        <p>快速 / 研究 / 复核：{settings?.models?.fast || "—"} · {settings?.models?.research || "—"} · {settings?.models?.review || "—"}</p>
        <p>同时跟踪上限：{settings?.maxTrackedCompanies ?? 5} 家已识别公司</p>
        <button type="button" className="ft-btn-soft" onClick={async () => setProbe(await v2("/v2/models/probe"))}>检查 OpenRouter 模型目录</button>
        {probe && (
          <p className="v2-empty">
            {(probe.notes || []).join("；") || "目录已获取"} · 条目 {probe.catalogSize} · 命中候选 {(probe.availableWanted || []).join("、") || "无"}
          </p>
        )}
      </section>
      <section className="ft-card v2-panel">
        <h2><Wallet className="h-4 w-4" /> 预算用量</h2>
        <p>日常研究已用 {settings?.spentCny ?? 0} / {settings?.monthlyBudgetCny ?? 80} 元，预留 {settings?.reservedCny ?? 0} 元。</p>
        <p>模型对照预算单独记账：已用 {settings?.comparisonSpentCny ?? 0} / {settings?.comparisonBudgetCny ?? 60} 元，不占用日常额度。</p>
        <div className="v2-composer-row">
          <input className="ft-input" value={budget} onChange={(event) => setBudget(event.target.value)} />
          <button type="button" className="ft-btn-primary" onClick={async () => { await v2("/v2/settings", { method: "PATCH", body: JSON.stringify({ monthlyBudgetCny: Number(budget) }) }); load(); }}>调整月度上限</button>
        </div>
        <p className="v2-empty">达到上限后暂停新的收费任务，不自动充值。历史查看与用户输入保存继续可用。预算限制调用次数，不降低证据标准。</p>
      </section>
      <section className="ft-card v2-panel">
        <h2><Radio className="h-4 w-4" /> 历史导入</h2>
        <p>把旧研报核验项目只读迁入 V2，不改写旧状态结构。</p>
        <button type="button" className="ft-btn-soft" onClick={async () => setImportResult(await v2("/v2/import/legacy", { method: "POST", body: "{}" }))}>导入历史项目</button>
        {importResult && <p className="v2-empty">{JSON.stringify(importResult)}</p>}
      </section>
    </div>
  );
};
