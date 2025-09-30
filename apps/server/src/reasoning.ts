// apps/server/src/reasoning.ts
// Multi-step reasoning and complex query decomposition

import { togetherChat } from "./models/together.js";
import type { ChatMessage } from "./types.js";

/**
 * Decompose a complex query into simpler sub-questions
 */
export async function decomposeQuery(query: string): Promise<string[]> {
  const system = `You are a query decomposition expert. Break down complex questions into simpler sub-questions that can be answered independently.

Rules:
1. Each sub-question should be self-contained
2. Order matters - later questions can build on earlier answers
3. Keep sub-questions focused and specific
4. Return ONLY a numbered list, nothing else

Example:
Input: "How has climate change affected polar bear populations and what are the main solutions being proposed?"
Output:
1. What is climate change and how does it affect Arctic regions?
2. How do polar bears depend on Arctic ice?
3. What are the current polar bear population trends?
4. What is causing the decline in polar bear populations?
5. What solutions are scientists proposing to help polar bears?`;

  try {
    const result = await togetherChat("thinking", system, [], query, { maxTokens: 500 });

    if (!result.success || !result.text) {
      return [query]; // Fallback: return original query
    }

    // Parse numbered list
    const subQuestions = result.text
      .split("\n")
      .filter(line => /^\d+[\.\)]\s+/.test(line.trim()))
      .map(line => line.replace(/^\d+[\.\)]\s+/, "").trim())
      .filter(q => q.length > 5);

    return subQuestions.length > 0 ? subQuestions : [query];
  } catch {
    return [query]; // Fallback
  }
}

/**
 * Synthesize multiple pieces of information into a coherent answer
 */
export async function synthesizeInformation(
  originalQuery: string,
  sources: Array<{ question: string; answer: string; source?: string }>
): Promise<string> {
  const system = `You are an information synthesis expert. Combine multiple pieces of information into a comprehensive, accurate answer.

Rules:
1. Prioritize accuracy - cite sources when making factual claims
2. Resolve contradictions by noting multiple perspectives
3. Maintain logical flow and coherence
4. Be concise but complete
5. Always cite sources at the end`;

  const context = sources
    .map((s, i) => `[Source ${i + 1}${s.source ? ` - ${s.source}` : ""}]\nQ: ${s.question}\nA: ${s.answer}`)
    .join("\n\n");

  const prompt = `Original question: "${originalQuery}"

Information gathered from multiple sources:

${context}

Synthesize the above information into a comprehensive answer to the original question. Include citations where appropriate.`;

  try {
    const result = await togetherChat("thinking", system, [], prompt, { maxTokens: 2000 });

    if (!result.success || !result.text) {
      // Fallback: combine answers directly
      return sources.map((s, i) => `${i + 1}. ${s.answer}`).join("\n\n");
    }

    return result.text;
  } catch {
    // Fallback: combine answers directly
    return sources.map((s, i) => `${i + 1}. ${s.answer}`).join("\n\n");
  }
}

/**
 * Verify and cross-reference facts from multiple sources
 */
export async function verifyFacts(
  claim: string,
  sources: string[]
): Promise<{ verified: boolean; confidence: number; explanation: string }> {
  const system = `You are a fact-checking expert. Analyze claims against multiple sources and determine accuracy.

Rules:
1. Look for consensus across sources
2. Identify contradictions or inconsistencies
3. Consider source reliability
4. Provide confidence score (0-100)
5. Be objective and evidence-based`;

  const prompt = `Claim to verify: "${claim}"

Sources:
${sources.map((s, i) => `[${i + 1}] ${s}`).join("\n\n")}

Analyze the claim against these sources. Respond in this exact format:
VERIFIED: [YES/NO/PARTIAL]
CONFIDENCE: [0-100]
EXPLANATION: [Your reasoning]`;

  try {
    const result = await togetherChat("thinking", system, [], prompt, { maxTokens: 500 });

    if (!result.success || !result.text) {
      return {
        verified: false,
        confidence: 0,
        explanation: "Unable to verify - insufficient information",
      };
    }

    const text = result.text;

    // Parse response
    const verifiedMatch = text.match(/VERIFIED:\s*(YES|NO|PARTIAL)/i);
    const confidenceMatch = text.match(/CONFIDENCE:\s*(\d+)/);
    const explanationMatch = text.match(/EXPLANATION:\s*(.+)/s);

    const verified = verifiedMatch?.[1]?.toUpperCase() === "YES";
    const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 50;
    const explanation = explanationMatch?.[1]?.trim() ?? text;

    return { verified, confidence, explanation };
  } catch {
    return {
      verified: false,
      confidence: 0,
      explanation: "Verification process failed",
    };
  }
}

/**
 * Assess confidence in an answer based on available information
 */
export async function assessConfidence(
  question: string,
  answer: string,
  sources: string[]
): Promise<{ confidence: number; reasoning: string; gaps: string[] }> {
  const system = `You are a confidence assessment expert. Evaluate how confident we should be in an answer based on available sources.

Consider:
1. Number and quality of sources
2. Consistency between sources
3. Specificity of information
4. Recency of information
5. Known gaps or uncertainties`;

  const prompt = `Question: "${question}"
Answer: "${answer}"

Sources used:
${sources.map((s, i) => `[${i + 1}] ${s.slice(0, 200)}...`).join("\n\n")}

Assess confidence in this answer. Respond in format:
CONFIDENCE: [0-100]
REASONING: [Why this confidence level]
GAPS: [What's missing or uncertain, one per line]`;

  try {
    const result = await togetherChat("thinking", system, [], prompt, { maxTokens: 500 });

    if (!result.success || !result.text) {
      return {
        confidence: 50,
        reasoning: "Unable to assess",
        gaps: ["Insufficient information for assessment"],
      };
    }

    const text = result.text;

    const confidenceMatch = text.match(/CONFIDENCE:\s*(\d+)/);
    const reasoningMatch = text.match(/REASONING:\s*([^\n]+)/);
    const gapsMatch = text.match(/GAPS:\s*(.+)/s);

    const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 50;
    const reasoning = reasoningMatch?.[1]?.trim() ?? "Moderate confidence based on available sources";
    const gaps = gapsMatch?.[1]
      ?.split("\n")
      .filter(g => g.trim())
      .map(g => g.replace(/^[-*•]\s*/, "").trim()) ?? [];

    return { confidence, reasoning, gaps };
  } catch {
    return {
      confidence: 50,
      reasoning: "Assessment failed",
      gaps: ["Unable to identify information gaps"],
    };
  }
}