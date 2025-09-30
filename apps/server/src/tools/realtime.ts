// apps/server/src/tools/realtime.ts
// Real-time data: weather, stocks, news, time, currency

import type { ToolDefinition } from "./types.js";

/**
 * Get current weather for a location
 */
async function getWeather(location: string): Promise<string> {
  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;

    if (!apiKey) {
      // Fallback to free wttr.in service
      const response = await fetch(`https://wttr.in/${encodeURIComponent(location)}?format=j1`, {
        headers: { "User-Agent": "curl/7.0" },
      });

      if (!response.ok) throw new Error(`Weather API error: ${response.status}`);

      const data: any = await response.json();
      const current = data.current_condition?.[0];
      const area = data.nearest_area?.[0];

      if (!current) throw new Error("No weather data available");

      return `**Weather for ${area?.areaName?.[0]?.value ?? location}**
Temperature: ${current.temp_C}°C (${current.temp_F}°F)
Feels like: ${current.FeelsLikeC}°C (${current.FeelsLikeF}°F)
Condition: ${current.weatherDesc?.[0]?.value}
Humidity: ${current.humidity}%
Wind: ${current.windspeedKmph} km/h ${current.winddir16Point}
Visibility: ${current.visibility} km
Pressure: ${current.pressure} mb`;
    }

    // OpenWeather API if key is available
    const url = new URL("https://api.openweathermap.org/data/2.5/weather");
    url.searchParams.set("q", location);
    url.searchParams.set("appid", apiKey);
    url.searchParams.set("units", "metric");

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`OpenWeather API error: ${response.status}`);

    const data: any = await response.json();

    return `**Weather for ${data.name}, ${data.sys?.country}**
Temperature: ${data.main.temp}°C (feels like ${data.main.feels_like}°C)
Condition: ${data.weather?.[0]?.description}
Humidity: ${data.main.humidity}%
Wind: ${data.wind.speed} m/s
Pressure: ${data.main.pressure} hPa
Visibility: ${data.visibility / 1000} km`;
  } catch (e: any) {
    return `Unable to fetch weather for "${location}": ${e?.message ?? "Unknown error"}`;
  }
}

/**
 * Get stock/crypto price and information
 */
async function getStockPrice(symbol: string): Promise<string> {
  try {
    // Free API: finnhub.io, alphavantage, or Yahoo Finance
    const apiKey = process.env.FINNHUB_API_KEY || process.env.ALPHA_VANTAGE_API_KEY;

    if (apiKey && process.env.FINNHUB_API_KEY) {
      // Finnhub
      const url = new URL("https://finnhub.io/api/v1/quote");
      url.searchParams.set("symbol", symbol.toUpperCase());
      url.searchParams.set("token", apiKey);

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error(`Finnhub API error: ${response.status}`);

      const data: any = await response.json();

      if (data.c === 0) throw new Error("Symbol not found");

      const change = data.c - data.pc;
      const changePercent = ((change / data.pc) * 100).toFixed(2);

      return `**${symbol.toUpperCase()}**
Current Price: $${data.c.toFixed(2)}
Open: $${data.o.toFixed(2)}
High: $${data.h.toFixed(2)}
Low: $${data.l.toFixed(2)}
Previous Close: $${data.pc.toFixed(2)}
Change: ${change > 0 ? "+" : ""}$${change.toFixed(2)} (${changePercent}%)
Timestamp: ${new Date(data.t * 1000).toLocaleString()}`;
    }

    // Fallback: Use Yahoo Finance (free, no API key)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol.toUpperCase()}`;
    const response = await fetch(url);

    if (!response.ok) throw new Error(`Yahoo Finance error: ${response.status}`);

    const data: any = await response.json();
    const quote = data.chart?.result?.[0];

    if (!quote) throw new Error("Symbol not found");

    const meta = quote.meta;
    const change = meta.regularMarketPrice - meta.previousClose;
    const changePercent = ((change / meta.previousClose) * 100).toFixed(2);

    return `**${meta.symbol}** - ${meta.longName ?? ""}
Current Price: $${meta.regularMarketPrice.toFixed(2)}
Previous Close: $${meta.previousClose.toFixed(2)}
Change: ${change > 0 ? "+" : ""}$${change.toFixed(2)} (${changePercent}%)
Day Range: $${meta.regularMarketDayLow.toFixed(2)} - $${meta.regularMarketDayHigh.toFixed(2)}
Volume: ${meta.regularMarketVolume.toLocaleString()}
Market: ${meta.exchangeName}`;
  } catch (e: any) {
    return `Unable to fetch price for "${symbol}": ${e?.message ?? "Unknown error"}. Make sure the symbol is correct (e.g., AAPL, TSLA, BTC-USD).`;
  }
}

/**
 * Get current time in a location/timezone
 */
async function getTime(location: string): Promise<string> {
  try {
    // Use WorldTimeAPI (free, no key required)
    const url = `https://worldtimeapi.org/api/timezone/${encodeURIComponent(location)}`;
    const response = await fetch(url);

    if (!response.ok) {
      // Try alternative: search by city/area
      const searchUrl = "https://worldtimeapi.org/api/timezone";
      const searchResponse = await fetch(searchUrl);
      const timezones: string[] = await searchResponse.json();

      const match = timezones.find(tz =>
        tz.toLowerCase().includes(location.toLowerCase())
      );

      if (!match) {
        return `Timezone not found for "${location}". Try format like "America/New_York" or "Europe/London".`;
      }

      const matchResponse = await fetch(`https://worldtimeapi.org/api/timezone/${match}`);
      const data: any = await matchResponse.json();

      return formatTimeResponse(data, match);
    }

    const data: any = await response.json();
    return formatTimeResponse(data, location);
  } catch (e: any) {
    return `Unable to fetch time for "${location}": ${e?.message ?? "Unknown error"}`;
  }
}

function formatTimeResponse(data: any, location: string): string {
  const datetime = new Date(data.datetime);

  return `**Time in ${location}**
Current Time: ${datetime.toLocaleTimeString()}
Date: ${datetime.toLocaleDateString()}
Full: ${datetime.toLocaleString()}
Timezone: ${data.timezone} (${data.abbreviation})
UTC Offset: ${data.utc_offset}
Day of Year: ${data.day_of_year}
Week: ${data.week_number}`;
}

/**
 * Get latest news headlines
 */
async function getNews(query?: string, category?: string): Promise<string> {
  try {
    const apiKey = process.env.NEWS_API_KEY;

    if (!apiKey) {
      return "News API key not configured. Set NEWS_API_KEY environment variable to enable news fetching.";
    }

    const url = new URL("https://newsapi.org/v2/top-headlines");

    if (query) {
      url.searchParams.set("q", query);
    }

    if (category) {
      url.searchParams.set("category", category);
    } else {
      url.searchParams.set("category", "general");
    }

    url.searchParams.set("language", "en");
    url.searchParams.set("pageSize", "5");

    const response = await fetch(url.toString(), {
      headers: { "X-Api-Key": apiKey },
    });

    if (!response.ok) throw new Error(`News API error: ${response.status}`);

    const data: any = await response.json();

    if (!data.articles || data.articles.length === 0) {
      return `No news articles found${query ? ` for "${query}"` : ""}.`;
    }

    let output = `**Latest News${query ? ` - "${query}"` : ""}**\n\n`;

    for (const article of data.articles) {
      output += `**${article.title}**\n`;
      output += `Source: ${article.source.name}\n`;
      if (article.description) {
        output += `${article.description}\n`;
      }
      output += `Link: ${article.url}\n`;
      output += `Published: ${new Date(article.publishedAt).toLocaleString()}\n\n`;
    }

    return output;
  } catch (e: any) {
    return `Unable to fetch news: ${e?.message ?? "Unknown error"}`;
  }
}

// Export tool definitions
export const weatherTool: ToolDefinition = {
  name: "get_weather",
  description: "Get current weather conditions for any location worldwide. Includes temperature, conditions, humidity, wind, etc.",
  parameters: [
    {
      name: "location",
      type: "string",
      description: "City name, city and country, or coordinates (e.g., 'London', 'Paris, France', '40.7,-74.0')",
      required: true,
    },
  ],
  execute: async (params: Record<string, any>) => {
    const location = params.location as string;
    if (!location || location.trim().length < 2) {
      return "Error: Location must be provided.";
    }
    return await getWeather(location.trim());
  },
};

export const stockTool: ToolDefinition = {
  name: "get_stock_price",
  description: "Get real-time stock or cryptocurrency prices and information. Supports all major exchanges.",
  parameters: [
    {
      name: "symbol",
      type: "string",
      description: "Stock ticker symbol (e.g., 'AAPL', 'GOOGL') or crypto pair (e.g., 'BTC-USD', 'ETH-USD')",
      required: true,
    },
  ],
  execute: async (params: Record<string, any>) => {
    const symbol = params.symbol as string;
    if (!symbol || symbol.trim().length < 1) {
      return "Error: Symbol must be provided.";
    }
    return await getStockPrice(symbol.trim());
  },
};

export const timeTool: ToolDefinition = {
  name: "get_current_time",
  description: "Get current time and date for any location or timezone worldwide.",
  parameters: [
    {
      name: "location",
      type: "string",
      description: "Timezone (e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo') or city name",
      required: true,
    },
  ],
  execute: async (params: Record<string, any>) => {
    const location = params.location as string;
    if (!location || location.trim().length < 2) {
      return "Error: Location/timezone must be provided.";
    }
    return await getTime(location.trim());
  },
};

export const newsTool: ToolDefinition = {
  name: "get_news",
  description: "Get latest news headlines from reliable sources. Can search by topic or category.",
  parameters: [
    {
      name: "query",
      type: "string",
      description: "Search query for specific news (optional)",
      required: false,
    },
    {
      name: "category",
      type: "string",
      description: "News category: business, entertainment, health, science, sports, technology (optional)",
      required: false,
    },
  ],
  execute: async (params: Record<string, any>) => {
    const query = params.query as string | undefined;
    const category = params.category as string | undefined;
    return await getNews(query, category);
  },
};