export interface TavilyHit {
  title: string;
  url: string;
  content: string;
  publishedAt: string | null;
}

export interface TavilyResult {
  hits: TavilyHit[];
  coverage: "COMPLETE" | "INCOMPLETE" | "FAILED" | "NOT_CONFIGURED";
  error?: string;
}

export class TavilyClient {
  constructor(
    private readonly apiKey = process.env.TAVILY_API_KEY || "",
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  configured(): boolean {
    return Boolean(this.apiKey);
  }

  async search(query: string): Promise<TavilyResult> {
    if (!this.apiKey) return { hits: [], coverage: "NOT_CONFIGURED", error: "未配置 TAVILY_API_KEY" };
    try {
      const response = await this.fetchImpl("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: this.apiKey,
          query,
          search_depth: "basic",
          include_answer: false,
          include_raw_content: false,
          max_results: 8,
        }),
      });
      if (!response.ok) {
        return { hits: [], coverage: "FAILED", error: `Tavily 返回 ${response.status}` };
      }
      const data = (await response.json()) as { results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }> };
      const hits = (data.results || []).map((item) => ({
        title: String(item.title || ""),
        url: String(item.url || ""),
        content: String(item.content || ""),
        publishedAt: item.published_date || null,
      })).filter((item) => item.url);
      return { hits, coverage: hits.length ? "COMPLETE" : "INCOMPLETE" };
    } catch (error) {
      return { hits: [], coverage: "FAILED", error: error instanceof Error ? error.message : "Tavily 请求失败" };
    }
  }
}
