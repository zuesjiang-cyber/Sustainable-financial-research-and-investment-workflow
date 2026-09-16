import { assertPublicHttpUrl } from "./ssrf";

export interface FetchedPage {
  url: string;
  title: string;
  text: string;
}

function stripHtml(html: string): { title: string; text: string } {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim();
  const without = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return { title, text: without.slice(0, 20_000) };
}

export async function fetchPublicPage(url: string, fetchImpl: typeof fetch = fetch): Promise<FetchedPage> {
  const parsed = await assertPublicHttpUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetchImpl(parsed.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "FinTrust/2.0 research-fetch" },
    });
    if (!response.ok) throw Object.assign(new Error(`网页获取失败 (${response.status})`), { statusCode: 502 });
    const html = await response.text();
    const stripped = stripHtml(html);
    return { url: parsed.toString(), title: stripped.title || parsed.hostname, text: stripped.text };
  } finally {
    clearTimeout(timer);
  }
}
