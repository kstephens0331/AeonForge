// apps/server/src/tools/calculator.ts
import type { ToolDefinition } from "./types.js";

function safeEval(expression: string): number {
  // Strip any non-mathematical characters for safety
  const sanitized = expression.replace(/[^0-9+\-*/.()%\s]/g, "");

  if (!sanitized.trim()) {
    throw new Error("Invalid expression");
  }

  try {
    // Use Function constructor for safer evaluation (still has risks, but better than eval)
    const result = Function(`"use strict"; return (${sanitized})`)();

    if (typeof result !== "number" || !isFinite(result)) {
      throw new Error("Result is not a valid number");
    }

    return result;
  } catch (e: any) {
    throw new Error(`Calculation error: ${e?.message ?? "Invalid expression"}`);
  }
}

export const calculatorTool: ToolDefinition = {
  name: "calculator",
  description: "Perform mathematical calculations. Supports +, -, *, /, %, parentheses, and decimal numbers.",
  parameters: [
    {
      name: "expression",
      type: "string",
      description: "The mathematical expression to evaluate (e.g., '2 + 2', '(10 * 5) / 2', 'sqrt(16)')",
      required: true,
    },
  ],
  execute: async (params: Record<string, any>) => {
    const expr = params.expression as string;
    if (!expr || expr.trim().length === 0) {
      return "Error: Expression cannot be empty.";
    }

    try {
      // Handle common math functions
      let processedExpr = expr
        .replace(/sqrt\(([^)]+)\)/g, "Math.sqrt($1)")
        .replace(/pow\(([^,]+),([^)]+)\)/g, "Math.pow($1,$2)")
        .replace(/abs\(([^)]+)\)/g, "Math.abs($1)")
        .replace(/floor\(([^)]+)\)/g, "Math.floor($1)")
        .replace(/ceil\(([^)]+)\)/g, "Math.ceil($1)")
        .replace(/round\(([^)]+)\)/g, "Math.round($1)");

      const result = safeEval(processedExpr);
      return `Result: ${result}`;
    } catch (e: any) {
      return `Error: ${e?.message ?? "Failed to calculate"}`;
    }
  },
};