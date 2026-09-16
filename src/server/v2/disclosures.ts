import type { OfficialDisclosureItem } from "../disclosures/officialFilingProvider";

export interface DisclosureSearchResult {
  items: OfficialDisclosureItem[];
  checkedAt: string;
  source: "CNINFO_LIVE" | "FAILED";
  coverage: "COMPLETE" | "INCOMPLETE" | "FAILED";
  error?: string;
}

const CATEGORIES = [
  "category_ndbg_szsh",
  "category_bndbg_szsh",
  "category_yjdbg_szsh",
  "category_sjdbg_szsh",
  "category_zsgg_szsh",
  "category_qyfpxzcs_szsh",
].join(";");

function classifyTitle(title: string): OfficialDisclosureItem["reportType"] {
  if (/第三季度|三季报/.test(title)) return "Q3";
  if (/半年度|半年报/.test(title)) return "HALF_YEAR";
  if (/第一季度|一季报/.test(title)) return "Q1";
  if (/年度报告|年报/.test(title)) return "ANNUAL";
  return "OTHER";
}

export class CninfoDisclosureClient {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async search(securityCode: string, exchange: "SSE" | "SZSE", since?: string): Promise<DisclosureSearchResult> {
    const checkedAt = new Date().toISOString();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const params = new URLSearchParams({
        pageNum: "1",
        pageSize: "30",
        column: exchange === "SZSE" ? "szse" : "sse",
        tabName: "fulltext",
        plate: "",
        stock: securityCode,
        searchkey: "",
        secid: "",
        category: CATEGORIES,
        trade: "",
        seDate: since ? `${since.slice(0, 10)}~` : "",
        sortName: "time",
        sortType: "desc",
        isHLtitle: "true",
      });
      const response = await this.fetchImpl("http://www.cninfo.com.cn/new/hisAnnouncement/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": "Mozilla/5.0 FinTrust/2.0",
        },
        body: params.toString(),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) {
        return { items: [], checkedAt, source: "FAILED", coverage: "FAILED", error: `巨潮返回 ${response.status}` };
      }
      const data = (await response.json()) as { announcements?: any[] };
      const announcements = Array.isArray(data?.announcements) ? data.announcements : [];
      const items: OfficialDisclosureItem[] = [];
      for (const item of announcements) {
        const title = String(item.announcementTitle || "").replace(/<[^>]+>/g, "");
        if (!title) continue;
        const yrMatch = title.match(/(20\d{2})年/);
        const yr = yrMatch ? yrMatch[1] : String(new Date().getFullYear());
        const reportType = classifyTitle(title);
        const publishedAt = new Date(Number(item.announcementTime)).toISOString();
        items.push({
          id: `cninfo-${item.announcementId}`,
          securityCode: item.secCode || securityCode,
          companyName: item.secName || "",
          exchange,
          title,
          reportType,
          period: { start: `${yr}-01-01`, end: `${yr}-12-31`, basis: "YEAR" },
          publishedAt,
          officialUrl: item.adjunctUrl ? `http://static.cninfo.com.cn/${item.adjunctUrl}` : "",
          isCorrection: /更正|修订/.test(title),
          source: "CNINFO_LIVE",
        });
      }
      return {
        items,
        checkedAt,
        source: "CNINFO_LIVE",
        coverage: items.length > 0 ? "COMPLETE" : "INCOMPLETE",
        error: items.length === 0 ? "官方披露检索为空，覆盖不完整" : undefined,
      };
    } catch (error) {
      return {
        items: [],
        checkedAt,
        source: "FAILED",
        coverage: "FAILED",
        error: error instanceof Error ? error.message : "官方披露检索失败",
      };
    }
  }
}
