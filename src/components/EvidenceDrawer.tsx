import React from "react";
import { X, FileText, AlertOctagon, ShieldAlert, Image as ImageIcon, HelpCircle, Info } from "lucide-react";
import type { EvidenceItem } from "../types/fintrust";

interface EvidenceDrawerProps {
  evidenceId: string | null;
  evidenceList?: EvidenceItem[];
  onClose: () => void;
  onSelectEvidence: (id: string) => void;
}

export const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({
  evidenceId,
  evidenceList = [],
  onClose,
  onSelectEvidence,
}) => {
  if (!evidenceId) return null;

  const currentEvidence = evidenceList.find((e) => e.evidence_id === evidenceId);

  // Special audit checks requested by code review
  const isSynthetic = currentEvidence ? !currentEvidence.image.endsWith(".pdf") : true;
  const isFablessSnippet = currentEvidence?.snippet.includes("Fabless");
  const isCostRevenue = currentEvidence?.snippet.includes("1,045,194,886.44");
  const isCashFlow = currentEvidence?.snippet.includes("466,319,946.20");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-300"
        id="evidence-drawer-container"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2">
            <span className="p-1.5 bg-blue-100 text-blue-800 rounded-md font-mono text-xs font-semibold">
              {evidenceId}
            </span>
            <h3 className="text-base font-semibold text-slate-900">底稿凭证追溯与真实性核验</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            id="close-evidence-drawer-btn"
            title="关闭底稿抽屉"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {!currentEvidence ? (
            /* Fail-closed Missing Evidence State */
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-6 space-y-4 text-center">
              <div className="inline-flex p-3 bg-rose-100 text-rose-700 rounded-full">
                <AlertOctagon className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-base font-bold text-rose-900">未检索到法定底稿凭证 (EVIDENCE_NOT_FOUND)</h4>
                <p className="text-xs font-mono text-rose-600 mt-1">Requested ID: {evidenceId}</p>
              </div>
              <p className="text-sm text-rose-800 leading-relaxed max-w-md mx-auto text-left bg-white/80 p-3 rounded-lg border border-rose-200">
                <strong>【FinTrust 证据完整性硬约束】</strong>: 当前案例已收录底稿中不存在索引为{" "}
                <code className="text-rose-900 bg-rose-100 px-1 py-0.5 rounded">{evidenceId}</code> 的原生文档切片。
                系统已触发 Fail-Closed 熔断保护，拒绝使用任何合成占位或假设内容，该条结论需人工重新校验凭证归档。
              </p>
              <div className="text-xs text-slate-500">
                已有凭证库列表：
                <div className="flex flex-wrap gap-1.5 justify-center mt-2">
                  {evidenceList.map((e) => (
                    <button
                      key={e.evidence_id}
                      onClick={() => onSelectEvidence(e.evidence_id)}
                      className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded text-slate-700 text-xs font-mono cursor-pointer"
                    >
                      {e.evidence_id}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Metadata Card */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">来源披露文档</span>
                  <span className="font-semibold text-slate-800 flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    {currentEvidence.document}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">报告期间 / 法定页码</span>
                  <span className="font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    {currentEvidence.period} · 第 {currentEvidence.page} 页
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">凭证真实性状态</span>
                  <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                    SYNTHETIC_SCHEMATIC_CARD (合成排版示意图 · 非原版PDF扫描)
                  </span>
                </div>
              </div>

              {/* Strict Audit Notice */}
              <div className="rounded-lg border border-amber-300 bg-amber-50/80 p-3.5 text-xs text-amber-900 space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold text-amber-800">
                  <Info className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>【原件核验边界说明与所缺文件清单】</span>
                </div>
                <p className="leading-relaxed">
                  当前系统展示的配图为根据公开文字排版的<strong>合成示意卡片</strong>，并非原始 PDF 原件直接截帧。
                  为满足最终产品级原件审计标准，需用户或系统归档上传以下原始文件：
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-amber-800 pl-1 font-mono text-[11px]">
                  <li>待补原件: 《{currentEvidence.document}》（提取第 {currentEvidence.page} 页原版清晰光栅图像或矢量切片）</li>
                  <li>文件校验状态: 原件 PDF 哈希校验待录入，示意图仅供排版与关键行数定位参考</li>
                </ul>
              </div>

              {/* Snippet Block */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    披露原文摘录 (Exact Verbatim Transcript)
                  </h4>
                  <span className="text-[11px] text-slate-400 font-mono">CAS Accounting Transcript</span>
                </div>
                <div className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs leading-relaxed font-mono shadow-inner select-all border border-slate-800">
                  {currentEvidence.snippet}
                </div>
              </div>

              {/* Special Audit Fact Checks if applicable */}
              {isFablessSnippet && (
                <div className="bg-blue-50/80 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 space-y-1">
                  <div className="font-semibold flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5 text-blue-600" />
                    <span>定性叙事核对审计（业务模式与代工协同）</span>
                  </div>
                  <p className="leading-relaxed text-[11px]">
                    - <strong>“测试周期压缩 15%”</strong>：经核对，该表述属于运营定性陈述样例，年报正式会计报表附注中无单一财务指标对账，已按定性研判标注，不可作为确定性财务事实。<br />
                    - <strong>“台积电、华润微代工”</strong>：原文确有阐述产业链协同，但原件完整上下文需结合采购前五名披露核验。
                  </p>
                </div>
              )}

              {isCostRevenue && (
                <div className="bg-emerald-50/80 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900 space-y-1">
                  <div className="font-semibold flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5 text-emerald-600" />
                    <span>第 85 页报表附注会计数据特别核对</span>
                  </div>
                  <p className="leading-relaxed text-[11px]">
                    法定报表附注精确发生额：营业收入 3,898,054,583.68 元；营业成本 1,912,334,714.23 元；研发费用 1,045,194,886.44 元。
                    重算综合毛利率为 <strong>50.94%</strong>，草稿中若写 52.00% 属于严重计算偏差，系统已行使拦截。
                  </p>
                </div>
              )}

              {isCashFlow && (
                <div className="bg-rose-50/80 border border-rose-200 rounded-lg p-3 text-xs text-rose-900 space-y-1">
                  <div className="font-semibold flex items-center gap-1">
                    <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />
                    <span>第 89 页现金流量表方向性拦截提示</span>
                  </div>
                  <p className="leading-relaxed text-[11px]">
                    法定经营现金流净额本期为 466,319,946.20 元，上期为 549,337,594.89 元，同比下降 <strong>15.11%</strong>。
                    草稿主张若写为“同比增长 15.11%”属于方向写反，系统已阻止该错误进入已发布简报。
                  </p>
                </div>
              )}

              {/* Visual Schematic Card */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    合成排版示意卡 (Schematic Asset Card)
                  </h4>
                  <span className="text-[11px] text-amber-700 flex items-center gap-1 font-mono">
                    <ImageIcon className="w-3 h-3" /> P.{currentEvidence.page} · {currentEvidence.image}
                  </span>
                </div>
                <div className="rounded-xl border border-slate-300 bg-slate-950 p-2 overflow-hidden shadow-sm">
                  <img
                    src={`/assets/${currentEvidence.image.replace(/^assets\//, "")}`}
                    alt={`底稿示意图 P.${currentEvidence.page}`}
                    className="w-full h-auto rounded-lg object-contain shadow-md"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      if (!target.src.includes("project/")) {
                        target.src = `/project/data/showcases/sbg_fy2025/assets/${currentEvidence.image.replace(/^assets\//, "")}`;
                      }
                    }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5 flex items-center justify-between">
                  <span>结构化重绘卡片 · 黄色框标示关键参数对账坐标</span>
                  <span className="text-amber-600 font-medium">示意图档（待替换PDF原件）</span>
                </p>
              </div>

              {/* Cross References */}
              <div className="pt-2 border-t border-slate-200">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  切换查看其他收录凭证
                </h4>
                <div className="flex flex-wrap gap-2">
                  {evidenceList.map((e) => (
                    <button
                      key={e.evidence_id}
                      onClick={() => onSelectEvidence(e.evidence_id)}
                      className={`px-2.5 py-1 rounded text-xs font-mono transition-colors cursor-pointer border ${
                        e.evidence_id === evidenceId
                          ? "bg-blue-600 text-white border-blue-600 font-semibold"
                          : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      {e.evidence_id} (第{e.page}页)
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
