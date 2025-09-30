// apps/server/src/tools/webSearch.ts
import type { ToolDefinition } from "./types.js";

async function searchWeb(query: string): Promise<string> {
  const API_KEY = process.env.SERPER_API_KEY || process.env.BRAVE_API_KEY;
  const ENGINE = process.env.SEARCH_ENGINE || "serper"; // serper, brave, or duckduckgo

  if (ENGINE === "serper" && process.env.SERPER_API_KEY) {
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": process.env.SERPER_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num: 5 }),
      });

      if (!res.ok) throw new Error(`Serper API error: ${res.status}`);

      const data: any = await res.json();
      const results = (data.organic ?? []).slice(0, 5).map((r: any, i: number) =>
        `[${i + 1}] ${r.title}\n${r.snippet}\nURL: ${r.link}`
      );

      return results.length > 0
        ? `Search results for "${query}":\n\n${results.join("\n\n")}`
        : "No results found.";
    } catch (e: any) {
      return `Search failed: ${e?.message ?? "Unknown error"}`;
    }
  }

  if (ENGINE === "brave" && process.env.BRAVE_API_KEY) {
    try {
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query);
      url.searchParams.set("count", "5");

      const res = await fetch(url.toString(), {
        headers: { "X-Subscription-Token": process.env.BRAVE_API_KEY },
      });

      if (!res.ok) throw new Error(`Brave API error: ${res.status}`);

      const data: any = await res.json();
      const results = (data.web?.results ?? []).slice(0, 5).map((r: any, i: number) =>
        `[${i + 1}] ${r.title}\n${r.description}\nURL: ${r.url}`
      );

      return results.length > 0
        ? `Search results for "${query}":\n\n${results.join("\n\n")}`
        : "No results found.";
    } catch (e: any) {
      return `Search failed: ${e?.message ?? "Unknown error"}`;
    }
  }

  // Fallback: DuckDuckGo HTML scraping (no API key needed, but less reliable)
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AeonForge/1.0)" },
    });

    if (!res.ok) throw new Error(`DDG error: ${res.status}`);

    const html = await res.text();
    // Basic regex extraction (fragile, but works for simple queries)
    const matches = html.matchAll(/<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g);
    const results = Array.from(matches).slice(0, 5).map((m, i) =>
      `[${i + 1}] ${m[2]}\nURL: ${m[1]}`
    );

    return results.length > 0
      ? `Search results for "${query}":\n\n${results.join("\n\n")}`
      : "No results found.";
  } catch (e: any) {
    return `Web search unavailable. Configure SERPER_API_KEY or BRAVE_API_KEY for better results.`;
  }
}

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  description: "Search the web for current information, news, or answers to questions requiring up-to-date data.",
  parameters: [
    {
      name: "query",
      type: "string",
      description: "The search query",
      required: true,
    },
  ],
  execute: async (params: Record<string, any>) => {
    const query = params.query as string;
    if (!query || query.trim().length < 2) {
      return "Error: Query must be at least 2 characters.";
    }
    return await searchWeb(query.trim());
  },
};