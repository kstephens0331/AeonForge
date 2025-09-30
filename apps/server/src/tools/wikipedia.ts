// apps/server/src/tools/wikipedia.ts
// Wikipedia integration for reliable factual information

import type { ToolDefinition } from "./types.js";

interface WikiSearchResult {
  title: string;
  snippet: string;
  pageid: number;
}

interface WikiPageContent {
  title: string;
  extract: string;
  url: string;
}

/**
 * Search Wikipedia for relevant articles
 */
async function searchWikipedia(query: string, limit: number = 5): Promise<WikiSearchResult[]> {
  try {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("list", "search");
    url.searchParams.set("srsearch", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("srlimit", limit.toString());

    const response = await fetch(url.toString(), {
      headers: { "User-Agent": "AeonForge/1.0 (https://aeonforge.ai)" },
    });

    if (!response.ok) throw new Error(`Wikipedia API error: ${response.status}`);

    const data: any = await response.json();
    return (data.query?.search ?? []).map((r: any) => ({
      title: r.title,
      snippet: r.snippet.replace(/<[^>]+>/g, ""),
      pageid: r.pageid,
    }));
  } catch (e: any) {
    console.warn("[wikipedia] Search failed:", e?.message ?? e);
    return [];
  }
}

/**
 * Get full content of a Wikipedia page
 */
async function getWikipediaPage(title: string): Promise<WikiPageContent | null> {
  try {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "query");
    url.searchParams.set("titles", title);
    url.searchParams.set("prop", "extracts|info");
    url.searchParams.set("exintro", "false"); // Get full article, not just intro
    url.searchParams.set("explaintext", "true"); // Plain text
    url.searchParams.set("inprop", "url");
    url.searchParams.set("format", "json");

    const response = await fetch(url.toString(), {
      headers: { "User-Agent": "AeonForge/1.0 (https://aeonforge.ai)" },
    });

    if (!response.ok) throw new Error(`Wikipedia API error: ${response.status}`);

    const data: any = await response.json();
    const pages = data.query?.pages ?? {};
    const page = Object.values(pages)[0] as any;

    if (!page || page.missing) return null;

    return {
      title: page.title,
      extract: page.extract ?? "",
      url: page.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
    };
  } catch (e: any) {
    console.warn("[wikipedia] Page fetch failed:", e?.message ?? e);
    return null;
  }
}

/**
 * Get Wikipedia summary (first few paragraphs)
 */
async function getWikipediaSummary(query: string): Promise<string> {
  try {
    // First search for the best matching article
    const searchResults = await searchWikipedia(query, 1);

    if (searchResults.length === 0) {
      return `No Wikipedia articles found for "${query}". The topic may not exist or be spelled differently.`;
    }

    const bestMatch = searchResults[0];

    // Get the full page content
    const page = await getWikipediaPage(bestMatch.title);

    if (!page) {
      return `Wikipedia article "${bestMatch.title}" exists but content could not be retrieved.`;
    }

    // Extract first few paragraphs (up to 2000 chars for summary)
    const summary = page.extract.slice(0, 2000);

    return `**${page.title}** (Wikipedia)\n\n${summary}${page.extract.length > 2000 ? "..." : ""}\n\nSource: ${page.url}`;
  } catch (e: any) {
    return `Failed to retrieve Wikipedia information: ${e?.message ?? "Unknown error"}`;
  }
}

/**
 * Search and retrieve detailed information from Wikipedia
 */
async function searchWikipediaDetailed(query: string): Promise<string> {
  try {
    // Search for top 3 articles
    const searchResults = await searchWikipedia(query, 3);

    if (searchResults.length === 0) {
      return `No Wikipedia articles found for "${query}".`;
    }

    let output = `Found ${searchResults.length} Wikipedia article(s) for "${query}":\n\n`;

    for (const result of searchResults) {
      const page = await getWikipediaPage(result.title);

      if (page) {
        // Get first 1000 chars as excerpt
        const excerpt = page.extract.slice(0, 1000);
        output += `**${page.title}**\n${excerpt}${page.extract.length > 1000 ? "..." : ""}\n\nFull article: ${page.url}\n\n---\n\n`;
      }
    }

    return output;
  } catch (e: any) {
    return `Failed to search Wikipedia: ${e?.message ?? "Unknown error"}`;
  }
}

export const wikipediaSummaryTool: ToolDefinition = {
  name: "wikipedia_summary",
  description: "Get a concise summary from Wikipedia for any topic. Use this for quick factual information on people, places, events, concepts, etc.",
  parameters: [
    {
      name: "query",
      type: "string",
      description: "The topic to look up on Wikipedia",
      required: true,
    },
  ],
  execute: async (params: Record<string, any>) => {
    const query = params.query as string;
    if (!query || query.trim().length < 2) {
      return "Error: Query must be at least 2 characters.";
    }
    return await getWikipediaSummary(query.trim());
  },
};

export const wikipediaSearchTool: ToolDefinition = {
  name: "wikipedia_search",
  description: "Search Wikipedia and retrieve detailed information from multiple articles. Use when you need comprehensive information or multiple perspectives.",
  parameters: [
    {
      name: "query",
      type: "string",
      description: "The topic to search for on Wikipedia",
      required: true,
    },
  ],
  execute: async (params: Record<string, any>) => {
    const query = params.query as string;
    if (!query || query.trim().length < 2) {
      return "Error: Query must be at least 2 characters.";
    }
    return await searchWikipediaDetailed(query.trim());
  },
};