import type { CompanyCandidate, CompanyIdentity } from "../../shared/v2Domain";

export const A_SHARE_CATALOG: CompanyIdentity[] = [
  { name: "圣邦股份", securityCode: "300661", exchange: "SZSE", aliases: ["圣邦微", "SG Micro", "SGMICRO"] },
  { name: "汇顶科技", securityCode: "603160", exchange: "SSE", aliases: ["Goodix", "汇顶"] },
  { name: "贵州茅台", securityCode: "600519", exchange: "SSE", aliases: ["茅台", "Kweichow Moutai"] },
  { name: "宁德时代", securityCode: "300750", exchange: "SZSE", aliases: ["CATL", "时代新能源"] },
  { name: "比亚迪", securityCode: "002594", exchange: "SZSE", aliases: ["BYD"] },
  { name: "隆基绿能", securityCode: "601012", exchange: "SSE", aliases: ["隆基", "隆基股份"] },
  { name: "中芯国际", securityCode: "688981", exchange: "SSE", aliases: ["SMIC"] },
  { name: "海康威视", securityCode: "002415", exchange: "SZSE", aliases: ["海康"] },
  { name: "立讯精密", securityCode: "002475", exchange: "SZSE", aliases: ["立讯"] },
  { name: "药明康德", securityCode: "603259", exchange: "SSE", aliases: ["WuXi", "药明"] },
];

const CODE_RE = /\b([0-9]{6})\b/g;

function scoreMatch(company: CompanyIdentity, text: string): CompanyCandidate | null {
  const hay = text.toLowerCase();
  let score = 0;
  const reasons: string[] = [];
  if (text.includes(company.securityCode)) {
    score += 8;
    reasons.push(`证券代码 ${company.securityCode}`);
  }
  if (text.includes(company.name)) {
    score += 6;
    reasons.push(`公司全称 ${company.name}`);
  }
  for (const alias of company.aliases || []) {
    if (alias.length >= 2 && hay.includes(alias.toLowerCase())) {
      score += alias.length >= 4 ? 4 : 2;
      reasons.push(`别名 ${alias}`);
    }
  }
  if (score <= 0) return null;
  return { ...company, score, reason: reasons.join("；") };
}

export function identifyCompanies(text: string): CompanyCandidate[] {
  const source = String(text || "");
  const ranked = A_SHARE_CATALOG.map((company) => scoreMatch(company, source)).filter(Boolean) as CompanyCandidate[];
  const codes = [...source.matchAll(CODE_RE)].map((match) => match[1]);
  for (const code of codes) {
    if (ranked.some((item) => item.securityCode === code)) continue;
    ranked.push({
      name: `未知公司 ${code}`,
      securityCode: code,
      exchange: code.startsWith("6") || code.startsWith("9") ? "SSE" : "SZSE",
      score: 3,
      reason: `文本中出现证券代码 ${code}，目录未收录全称`,
    });
  }
  ranked.sort((a, b) => b.score - a.score || a.securityCode.localeCompare(b.securityCode));
  const seen = new Set<string>();
  return ranked.filter((item) => {
    if (seen.has(item.securityCode)) return false;
    seen.add(item.securityCode);
    return true;
  });
}

export function resolveIdentity(candidates: CompanyCandidate[]): {
  status: "IDENTIFIED" | "AMBIGUOUS" | "UNKNOWN";
  company: CompanyIdentity | null;
} {
  if (candidates.length === 0) return { status: "UNKNOWN", company: null };
  const top = candidates[0];
  const close = candidates.filter((item) => item.score >= top.score - 1 && item.securityCode !== top.securityCode);
  if (top.score >= 6 && close.length === 0) {
    return { status: "IDENTIFIED", company: { name: top.name, securityCode: top.securityCode, exchange: top.exchange, aliases: top.aliases } };
  }
  if (candidates.length > 1) return { status: "AMBIGUOUS", company: null };
  if (top.score >= 6) {
    return { status: "IDENTIFIED", company: { name: top.name, securityCode: top.securityCode, exchange: top.exchange, aliases: top.aliases } };
  }
  return { status: "UNKNOWN", company: null };
}

export function findCompany(codeOrName: string): CompanyIdentity | null {
  const needle = codeOrName.trim();
  return A_SHARE_CATALOG.find((item) => item.securityCode === needle || item.name === needle || item.aliases?.includes(needle)) || null;
}
