import React from "react";
import { FileSearch, Link2, ShieldAlert, X } from "lucide-react";

export const EvidenceSidebar: React.FC<{
  open: boolean;
  onClose: () => void;
  evidence: any | null;
}> = ({ open, onClose, evidence }) => {
  if (!open) return null;
  const item = evidence?.evidence || evidence;
  return (
    <div className="v2-drawer-backdrop" onClick={onClose}>
      <aside className="v2-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="v2-drawer-head">
          <div>
            <div className="ft-eyebrow"><FileSearch className="h-3.5 w-3.5" /> 证据</div>
            <h2>{item?.title || "证据"}</h2>
          </div>
          <button type="button" className="ft-btn-icon" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        {item ? (
          <div className="v2-drawer-body">
            <p className="v2-quote">“{item.quote}”</p>
            <dl className="v2-meta-grid">
              <div><dt>来源类型</dt><dd>{item.sourceKind}</dd></div>
              <div><dt>发生时间</dt><dd>{item.occurredAt || "未知"}</dd></div>
              <div><dt>披露时间</dt><dd>{item.disclosedAt || "未知"}</dd></div>
              <div><dt>发现时间</dt><dd>{item.discoveredAt}</dd></div>
              <div><dt>页码 / 坐标</dt><dd>{item.page || "—"} {item.bbox ? JSON.stringify(item.bbox) : ""}</dd></div>
              <div><dt>转载合并</dt><dd>{item.reprintOf || item.originKey}</dd></div>
              <div><dt>解析质量</dt><dd>{item.quality}</dd></div>
              <div><dt>公司 / 代码</dt><dd>{item.companyName || "—"} {item.securityCode || ""}</dd></div>
            </dl>
            {item.documentId && (
              <a className="ft-btn-soft" href={`/v2/documents/${item.documentId}/original`} target="_blank" rel="noreferrer">
                打开已解析 PDF 原件
              </a>
            )}
            {item.url && (
              <a className="ft-btn-soft" href={item.url} target="_blank" rel="noreferrer">
                <Link2 className="h-3.5 w-3.5" /> 打开原始网页
              </a>
            )}
            <div className="v2-note">
              <ShieldAlert className="h-4 w-4" />
              转载数量不增加证据份数。当事方声明默认保留归因，不自动扩写成更强事实。
            </div>
            {Array.isArray(evidence?.events) && evidence.events.length > 0 && (
              <section>
                <h3>核验结果</h3>
                {evidence.events.map((event: any) => (
                  <p key={event.id}><strong>{event.verification}</strong> · {event.stage} · {event.proposition}</p>
                ))}
              </section>
            )}
            {Array.isArray(evidence?.analyses) && evidence.analyses.length > 0 && (
              <section>
                <h3>依赖这条证据的分析</h3>
                {evidence.analyses.map((analysis: any) => (
                  <p key={analysis.id}>{analysis.text}</p>
                ))}
              </section>
            )}
          </div>
        ) : <p className="text-sm text-slate-500">未选择证据。</p>}
      </aside>
    </div>
  );
};
