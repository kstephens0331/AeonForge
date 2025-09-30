// apps/server/src/tools/index.ts
import type { ToolDefinition, ToolCall, ToolResult } from "./types.js";
import { webSearchTool } from "./webSearch.js";
import { calculatorTool } from "./calculator.js";
import { codeExecutorTool } from "./codeExecutor.js";
import { webScraperTool } from "./webScraper.js";
import { wikipediaSummaryTool, wikipediaSearchTool } from "./wikipedia.js";
import { weatherTool, stockTool, timeTool, newsTool } from "./realtime.js";

// Registry of all available tools
const TOOL_REGISTRY: Record<string, ToolDefinition> = {
  // Core tools
  web_search: webSearchTool,
  calculator: calculatorTool,
  execute_code: codeExecutorTool,

  // Web scraping & content
  scrape_webpage: webScraperTool,

  // Knowledge sources
  wikipedia_summary: wikipediaSummaryTool,
  wikipedia_search: wikipediaSearchTool,

  // Real-time data
  get_weather: weatherTool,
  get_stock_price: stockTool,
  get_current_time: timeTool,
  get_news: newsTool,
};

/**
 * Get all available tools
 */
export function getAvailableTools(): ToolDefinition[] {
  return Object.values(TOOL_REGISTRY);
}

/**
 * Get a specific tool by name
 */
export function getTool(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY[name];
}

/**
 * Execute a tool call
 */
export async function executeTool(toolCall: ToolCall): Promise<ToolResult> {
  const tool = getTool(toolCall.toolName);

  if (!tool) {
    return {
      toolName: toolCall.toolName,
      result: "",
      error: `Tool "${toolCall.toolName}" not found.`,
    };
  }

  try {
    // Validate required parameters
    for (const param of tool.parameters) {
      if (param.required && !(param.name in toolCall.parameters)) {
        throw new Error(`Missing required parameter: ${param.name}`);
      }
    }

    const result = await tool.execute(toolCall.parameters);
    return {
      toolName: toolCall.toolName,
      result,
    };
  } catch (e: any) {
    return {
      toolName: toolCall.toolName,
      result: "",
      error: e?.message ?? "Tool execution failed",
    };
  }
}

/**
 * Parse tool calls from LLM response
 * Looks for patterns like: <tool>tool_name</tool><params>{"key": "value"}</params>
 */
export function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const regex = /<tool>(.*?)<\/tool>\s*<params>(.*?)<\/params>/gs;

  let match;
  while ((match = regex.exec(text)) !== null) {
    const toolName = match[1].trim();
    const paramsStr = match[2].trim();

    try {
      const parameters = JSON.parse(paramsStr);
      calls.push({ toolName, parameters });
    } catch {
      console.warn(`[tools] Failed to parse parameters for tool ${toolName}`);
    }
  }

  return calls;
}

/**
 * Generate tool descriptions for system prompt
 */
export function generateToolPrompt(): string {
  const tools = getAvailableTools();

  if (tools.length === 0) return "";

  const descriptions = tools.map(tool => {
    const params = tool.parameters
      .map(p => `  - ${p.name} (${p.type}${p.required ? ", required" : ", optional"}): ${p.description}`)
      .join("\n");

    return `### ${tool.name}\n${tool.description}\nParameters:\n${params}`;
  }).join("\n\n");

  return `

## Available Tools

You have access to the following tools. To use a tool, output:
<tool>tool_name</tool>
<params>{"param": "value"}</params>

Available tools:

${descriptions}

IMPORTANT: Always use tools to provide accurate, up-to-date information. Never guess or make up information.

Tool selection guidelines:
- General knowledge/facts: wikipedia_summary, wikipedia_search
- Current events/breaking news: web_search, get_news
- Web articles/documentation: scrape_webpage
- Weather: get_weather
- Stock/crypto prices: get_stock_price
- Time zones: get_current_time
- Math/calculations: calculator
- Code execution: execute_code

You can use multiple tools in sequence. Always verify information when possible by checking multiple sources.`;
}

export * from "./types.js";