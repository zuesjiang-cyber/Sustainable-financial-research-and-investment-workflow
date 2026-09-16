import React, { useEffect, useState } from "react";
import { Clapperboard } from "lucide-react";
import { v2 } from "./api";

export const ReplayPage: React.FC<{ onOpen: (id: string) => void }> = ({ onOpen }) => {
  const [packs, setPacks] = useState<any[]>([]);
  useEffect(() => {
    v2<any[]>("/v2/replays").then(setPacks).catch(() => setPacks([]));
  }, []);
  return (
    <div className="v2-replay">
      <span className="ft-eyebrow"><Clapperboard className="h-3.5 w-3.5" /> 历史事件回放</span>
      <h1>用真实来源的时间序列演示完整过程，与用户研究数据隔离。</h1>
      <div className="v2-home-grid">
        {packs.map((pack) => (
          <article key={pack.id} className="ft-card v2-panel">
            <h2>{pack.company.name} {pack.company.securityCode}</h2>
            <p>回放日期 {pack.asOf}</p>
            <p>{pack.summary}</p>
            <button type="button" className="ft-btn-primary" onClick={async () => {
              const project = await v2<any>(`/v2/replays/${pack.id}/start`, { method: "POST", body: "{}" });
              onOpen(project.id);
            }}>打开回放</button>
          </article>
        ))}
      </div>
    </div>
  );
};
