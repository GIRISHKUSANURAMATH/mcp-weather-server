import type { WeatherConfig } from "../src/config.js";
import type { FetchLike } from "../src/services/weather-service.js";

export const testConfig: WeatherConfig = {
  apiBase: "https://api.weather.gov",
  userAgent: "test-agent/1.0",
  timeoutMs: 5_000,
  maxRetries: 1,
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/geo+json" },
  });
}

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;

/** A fake fetch that dispatches on URL substrings and records every call. */
export function mockFetch(routes: Record<string, Route>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, init });
    for (const [pattern, route] of Object.entries(routes)) {
      if (url.includes(pattern)) return route(url, init);
    }
    return jsonResponse({ title: "Not Found", detail: `no mock for ${url}` }, 404);
  };
  return { fetch: fn, calls };
}

export const sampleAlerts = {
  type: "FeatureCollection",
  features: [
    {
      properties: {
        event: "Flood Warning",
        areaDesc: "Sacramento; Yolo",
        severity: "Severe",
        urgency: "Immediate",
        certainty: "Observed",
        headline: "Flood Warning issued for Sacramento",
        description: "Heavy rain has caused flooding along the river.",
        instruction: "Turn around, don't drown.",
        effective: "2026-11-06T10:00:00-08:00",
        expires: "2026-11-07T10:00:00-08:00",
        senderName: "NWS Sacramento CA",
      },
    },
    {
      properties: {
        event: "Wind Advisory",
        areaDesc: "San Francisco Bay Shoreline",
        severity: "Moderate",
        urgency: "Expected",
        certainty: "Likely",
        headline: null,
        description: "Gusts up to 45 mph.",
        instruction: null,
      },
    },
  ],
};

export const samplePoints = {
  properties: {
    gridId: "STO",
    gridX: 46,
    gridY: 72,
    forecast: "https://api.weather.gov/gridpoints/STO/46,72/forecast",
    relativeLocation: { properties: { city: "Sacramento", state: "CA" } },
  },
};

export const sampleForecast = {
  properties: {
    updateTime: "2026-11-06T18:00:00+00:00",
    periods: [
      {
        number: 1,
        name: "Tonight",
        startTime: "2026-11-06T18:00:00-08:00",
        endTime: "2026-11-07T06:00:00-08:00",
        isDaytime: false,
        temperature: 48,
        temperatureUnit: "F",
        probabilityOfPrecipitation: { unitCode: "wmoUnit:percent", value: 20 },
        windSpeed: "5 mph",
        windDirection: "NW",
        shortForecast: "Mostly Clear",
        detailedForecast: "Mostly clear, with a low around 48.",
      },
      {
        number: 2,
        name: "Saturday",
        startTime: "2026-11-07T06:00:00-08:00",
        endTime: "2026-11-07T18:00:00-08:00",
        isDaytime: true,
        temperature: 67,
        temperatureUnit: "F",
        probabilityOfPrecipitation: { unitCode: "wmoUnit:percent", value: null },
        windSpeed: "5 to 10 mph",
        windDirection: "N",
        shortForecast: "Sunny",
        detailedForecast: "Sunny, with a high near 67.",
      },
    ],
  },
};
