// apps/server/src/orchestrator.ts
// Intelligent query routing and multi-tool orchestration

import { executeTool } from "./tools/index.js";
import { decomposeQuery, synthesizeInformation, assessConfidence } from "./reasoning.js";
import type { ToolCall } from "./tools/types.js";

/**
 * Analyze a query and determine the best approach to answer it
 */
export async function analyzeQuery(query: string): Promise<{
  complexity: "simple" | "moderate" | "complex";
  category: string;
  suggestedTools: string[];
  requiresDecomposition: boolean;
}> {
  const lowerQuery = query.toLowerCase();

  // Detect categories
  const categories: Record<string, RegExp[]> = {
    weather: [/weather|temperature|forecast|rain|snow|sunny|cloudy/],
    stocks: [/stock|share price|market|ticker|nasdaq|dow jones|s&p/],
    time: [/what time|current time|timezone|clock/],
    news: [/latest news|breaking news|current events|headlines/],
    math: [/calculate|compute|math|equation|solve|how many|how much.*cost/],
    code: [/code|program|script|function|algorithm|debug/],
    facts: [/who is|what is|when did|where is|history of|definition of/],
    comparison: [/compare|difference between|versus|vs\.|better than/],
    howto: [/how to|how do|tutorial|guide|steps to/],
    explanation: [/why|explain|how does.*work|what causes/],
  };

  let category = "general";
  for (const [cat, patterns] of Object.entries(categories)) {
    if (patterns.some(p => p.test(lowerQuery))) {
      category = cat;
      break;
    }
  }

  // Suggest tools based on category
  const toolMap: Record<string, string[]> = {
    weather: ["get_weather"],
    stocks: ["get_stock_price"],
    time: ["get_current_time"],
    news: ["get_news", "web_search"],
    math: ["calculator"],
    code: ["execute_code", "web_search"],
    facts: ["wikipedia_summary", "web_search"],
    comparison: ["wikipedia_summary", "web_search", "scrape_webpage"],
    howto: ["web_search", "scrape_webpage", "wikipedia_search"],
    explanation: ["wikipedia_summary", "web_search"],
    general: ["web_search", "wikipedia_summary"],
  };

  const suggestedTools = toolMap[category] || ["web_search"];

  // Determine complexity
  const wordCount = query.split(/\s+/).length;
  const hasMultipleParts = query.includes(" and ") || query.includes(",") || query.includes(";");
  const hasComparison = /compare|versus|difference between/i.test(query);

  let complexity: "simple" | "moderate" | "complex" = "simple";
  let requiresDecomposition = false;

  if (hasMultipleParts || hasComparison || wordCount > 20) {
    complexity = "moderate";
  }

  if ((hasMultipleParts && hasComparison) || wordCount > 30) {
    complexity = "complex";
    requiresDecomposition = true;
  }

  return { complexity, category, suggestedTools, requiresDecomposition };
}

/**
 * Execute tools in the optimal order and synthesize results
 */
export async function orchestrateTools(
  query: string,
  toolCalls: ToolCall[]
): Promise<{
  results: Array<{ tool: string; result: string; error?: string }>;
  synthesized?: string;
}> {
  const results: Array<{ tool: string; result: string; error?: string }> = [];

  // Execute tools in parallel when possible
  const toolPromises = toolCalls.map(async (call) => {
    const result = await executeTool(call);
    return {
      tool: call.toolName,
      result: result.result,
      error: result.error,
    };
  });

  const toolResults = await Promise.all(toolPromises);
  results.push(...toolResults);

  // If multiple successful results, synthesize them
  const successfulResults = results.filter(r => !r.error && r.result);

  if (successfulResults.length > 1) {
    const sources = successfulResults.map(r => ({
      question: query,
      answer: r.result,
      source: r.tool,
    }));

    const synthesized = await synthesizeInformation(query, sources);

    return { results, synthesized };
  }

  return { results };
}

/**
 * Handle a complex query with full orchestration
 */
export async function handleComplexQuery(
  query: string,
  executeToolsFn: (toolCalls: ToolCall[]) => Promise<string[]>
): Promise<{
  answer: string;
  confidence: number;
  sources: string[];
  reasoning: string;
}> {
  // 1. Analyze the query
  const analysis = await analyzeQuery(query);

  // 2. Decompose if needed
  let subQuestions: string[] = [query];
  if (analysis.requiresDecomposition) {
    subQuestions = await decomposeQuery(query);
  }

  // 3. Gather information for each sub-question
  const allSources: string[] = [];
  const allAnswers: Array<{ question: string; answer: string }> = [];

  for (const subQ of subQuestions) {
    // Determine which tools to use
    const toolCalls: ToolCall[] = analysis.suggestedTools.map(tool => {
      // Map tool names to appropriate parameters
      const params: Record<string, any> = {};

      if (tool === "wikipedia_summary" || tool === "wikipedia_search") {
        params.query = subQ;
      } else if (tool === "web_search") {
        params.query = subQ;
      } else if (tool === "scrape_webpage") {
        // Skip scraping for now, needs URL
        return null;
      } else if (tool === "get_weather") {
        // Extract location from query
        const locationMatch = subQ.match(/in\s+([A-Za-z\s,]+?)(?:\s|$|[?.!])/);
        if (locationMatch) {
          params.location = locationMatch[1].trim();
        }
      } else if (tool === "get_stock_price") {
        // Extract ticker symbol
        const tickerMatch = subQ.match(/\b([A-Z]{1,5})\b/);
        if (tickerMatch) {
          params.symbol = tickerMatch[1];
        }
      } else if (tool === "calculator") {
        params.expression = subQ;
      }

      return params && Object.keys(params).length > 0
        ? { toolName: tool, parameters: params }
        : null;
    }).filter(Boolean) as ToolCall[];

    if (toolCalls.length > 0) {
      const results = await executeToolsFn(toolCalls);
      allSources.push(...results.filter(r => r && r.length > 0));

      const combinedAnswer = results.join("\n\n");
      allAnswers.push({ question: subQ, answer: combinedAnswer });
    }
  }

  // 4. Synthesize all information
  const finalAnswer = allAnswers.length > 1
    ? await synthesizeInformation(query, allAnswers.map(a => ({ ...a, source: "research" })))
    : allAnswers[0]?.answer ?? "Unable to find sufficient information.";

  // 5. Assess confidence
  const { confidence, reasoning } = await assessConfidence(query, finalAnswer, allSources);

  return {
    answer: finalAnswer,
    confidence,
    sources: allSources,
    reasoning,
  };
}

/**
 * Generate a helpful error message that guides the user
 */
export function generateHelpfulError(
  query: string,
  error: string,
  attemptedTools: string[]
): string {
  const category = query.toLowerCase().includes("weather") ? "weather" :
                   query.toLowerCase().includes("stock") ? "stocks" :
                   query.toLowerCase().includes("news") ? "news" :
                   "general";

  const suggestions: Record<string, string[]> = {
    weather: [
      "Try specifying a city name (e.g., 'weather in London')",
      "Include country for clarity (e.g., 'weather in Paris, France')",
      "Use major city names for better results",
    ],
    stocks: [
      "Use the stock ticker symbol (e.g., 'AAPL' for Apple)",
      "For crypto, use format like 'BTC-USD' or 'ETH-USD'",
      "Make sure the symbol is correct and the market is open",
    ],
    news: [
      "Try being more specific about the topic",
      "Specify a category (business, technology, sports, etc.)",
      "Add time context (e.g., 'latest news about...')",
    ],
    general: [
      "Try rephrasing your question more specifically",
      "Break down complex questions into simpler parts",
      "Provide more context or details about what you're looking for",
    ],
  };

  const tips = suggestions[category] || suggestions.general;

  return `I encountered an issue while trying to answer your question: ${error}

Here's what I tried: ${attemptedTools.join(", ")}

Suggestions to help me answer better:
${tips.map((t, i) => `${i + 1}. ${t}`).join("\n")}

Please try rephrasing your question, and I'll do my best to help!`;
}