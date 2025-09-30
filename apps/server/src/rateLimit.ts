// apps/server/src/rateLimit.ts
// Rate limiting and quota management

import { admin } from "./db.js";

type QuotaConfig = {
  maxRequestsPerDay: number;
  maxTokensPerDay: number;
  maxRequestsPerHour: number;
};

// Default quotas (can be overridden by database)
const DEFAULT_QUOTAS: QuotaConfig = {
  maxRequestsPerDay: 1000,
  maxTokensPerDay: 500_000,
  maxRequestsPerHour: 100,
};

/**
 * Check if user is within rate limits
 */
export async function checkRateLimit(
  userId: string
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  const ENABLE_RATE_LIMITING = (process.env.ENABLE_RATE_LIMITING ?? "true").toLowerCase() === "true";

  if (!ENABLE_RATE_LIMITING) {
    return { allowed: true };
  }

  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Get recent requests count
    const { count: dailyCount } = await admin
      .from("request_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", oneDayAgo.toISOString());

    if ((dailyCount ?? 0) >= DEFAULT_QUOTAS.maxRequestsPerDay) {
      return {
        allowed: false,
        reason: `Daily request limit reached (${DEFAULT_QUOTAS.maxRequestsPerDay} requests per day)`,
        retryAfter: 86400, // 24 hours in seconds
      };
    }

    const { count: hourlyCount } = await admin
      .from("request_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", oneHourAgo.toISOString());

    if ((hourlyCount ?? 0) >= DEFAULT_QUOTAS.maxRequestsPerHour) {
      return {
        allowed: false,
        reason: `Hourly request limit reached (${DEFAULT_QUOTAS.maxRequestsPerHour} requests per hour)`,
        retryAfter: 3600, // 1 hour in seconds
      };
    }

    // Get token usage in last 24 hours
    const { data: recentLogs } = await admin
      .from("request_logs")
      .select("tokens_in, tokens_out")
      .eq("user_id", userId)
      .gte("created_at", oneDayAgo.toISOString());

    const totalTokens = (recentLogs ?? []).reduce(
      (sum, log) => sum + (log.tokens_in ?? 0) + (log.tokens_out ?? 0),
      0
    );

    if (totalTokens >= DEFAULT_QUOTAS.maxTokensPerDay) {
      return {
        allowed: false,
        reason: `Daily token limit reached (${DEFAULT_QUOTAS.maxTokensPerDay} tokens per day)`,
        retryAfter: 86400,
      };
    }

    return { allowed: true };
  } catch (e: any) {
    console.warn("[rateLimit] Check failed, allowing request:", e?.message ?? e);
    return { allowed: true }; // Fail open
  }
}

/**
 * Get user's current quota usage
 */
export async function getQuotaUsage(userId: string): Promise<{
  requestsToday: number;
  tokensToday: number;
  requestsThisHour: number;
  limits: QuotaConfig;
}> {
  try {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const { count: requestsToday } = await admin
      .from("request_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", oneDayAgo.toISOString());

    const { count: requestsThisHour } = await admin
      .from("request_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", oneHourAgo.toISOString());

    const { data: recentLogs } = await admin
      .from("request_logs")
      .select("tokens_in, tokens_out")
      .eq("user_id", userId)
      .gte("created_at", oneDayAgo.toISOString());

    const tokensToday = (recentLogs ?? []).reduce(
      (sum, log) => sum + (log.tokens_in ?? 0) + (log.tokens_out ?? 0),
      0
    );

    return {
      requestsToday: requestsToday ?? 0,
      tokensToday,
      requestsThisHour: requestsThisHour ?? 0,
      limits: DEFAULT_QUOTAS,
    };
  } catch (e: any) {
    console.warn("[rateLimit] getQuotaUsage failed:", e?.message ?? e);
    return {
      requestsToday: 0,
      tokensToday: 0,
      requestsThisHour: 0,
      limits: DEFAULT_QUOTAS,
    };
  }
}