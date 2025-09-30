// apps/server/src/tools/webScraper.ts
// Advanced web scraping with content extraction

import type { ToolDefinition } from "./types.js";

/**
 * Scrape and extract clean content from a URL
 */
async function scrapeUrl(url: string): Promise<string> {
  try {
    // Validate URL
    const urlObj = new URL(url);

    // Use Mozilla's Readability-like extraction
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AeonForge/1.0; +https://aeonforge.ai)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    // Basic HTML content extraction
    const content = extractContent(html);

    if (!content || content.length < 50) {
      throw new Error("Insufficient content extracted");
    }

    return content;
  } catch (e: any) {
    return `Failed to scrape ${url}: ${e?.message ?? "Unknown error"}`;
  }
}

/**
 * Extract main content from HTML
 * Removes scripts, styles, nav, ads, etc.
 */
function extractContent(html: string): string {
  // Remove script and style tags
  let cleaned = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, "")
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, "")
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  // Extract text from remaining HTML
  let text = cleaned
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Clean up whitespace
  text = text
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join("\n");

  // Limit to reasonable size
  return text.slice(0, 50000);
}

export const webScraperTool: ToolDefinition = {
  name: "scrape_webpage",
  description: "Extract full text content from any webpage. Use this when you need to read articles, documentation, or web pages to answer questions accurately.",
  parameters: [
    {
      name: "url",
      type: "string",
      description: "The full URL to scrape (must include http:// or https://)",
      required: true,
    },
  ],
  execute: async (params: Record<string, any>) => {
    const url = params.url as string;

    if (!url || !url.match(/^https?:\/\//)) {
      return "Error: Invalid URL. Must start with http:// or https://";
    }

    return await scrapeUrl(url);
  },
};