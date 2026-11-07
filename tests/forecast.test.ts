import { describe, expect, it } from "vitest";
import { WeatherService } from "../src/services/weather-service.js";
import { handleGetForecast } from "../src/tools/forecast.js";
import { jsonResponse, mockFetch, sampleForecast, samplePoints, testConfig } from "./helpers.js";

const text = (r: { content: Array<{ type: string; text?: string }> }) => r.content.map((c) => c.text).join("");
const svc = (routes: Parameters<typeof mockFetch>[0]) => {
  const m = mockFetch(routes);
  return { service: new WeatherService(testConfig, { fetch: m.fetch, retryDelayMs: 0 }), calls: m.calls };
};

describe("get_forecast", () => {
  it("follows points -> forecast URL and formats periods", async () => {
    const { service, calls } = svc({
      "/points/": () => jsonResponse(samplePoints),
      "/gridpoints/STO/46,72/forecast": () => jsonResponse(sampleForecast),
    });
    const r = await handleGetForecast(service, { latitude: 38.581572, longitude: -121.4944 });

    expect(r.isError).toBeUndefined();
    const t = text(r);
    expect(t).toContain("Forecast for Sacramento, CA (38.5816, -121.4944)");
    expect(t).toContain("NWS grid: STO 46,72");
    expect(t).toContain("Tonight:");
    expect(t).toContain("Temperature: 48°F");
    expect(t).toContain("Conditions: Mostly Clear");
    expect(t).toContain("Wind: 5 mph NW");
    expect(t).toContain("Chance of precipitation: 20%");
    expect(t).toContain("Saturday:");
    expect(t).toContain("Wind: 5 to 10 mph N");

    // Correct two-step workflow; forecast URL taken from the points response, not hardcoded.
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.weather.gov/points/38.5816,-121.4944",
      "https://api.weather.gov/gridpoints/STO/46,72/forecast",
    ]);
  });

  it("omits precipitation when NWS reports null", async () => {
    const { service } = svc({
      "/points/": () => jsonResponse(samplePoints),
      "/forecast": () => jsonResponse(sampleForecast),
    });
    const t = text(await handleGetForecast(service, { latitude: 38.58, longitude: -121.49 }));
    const saturday = t.slice(t.indexOf("Saturday:"));
    expect(saturday).not.toContain("Chance of precipitation");
  });

  it("rejects invalid coordinates without calling the API", async () => {
    const { service, calls } = svc({});
    const r = await handleGetForecast(service, { latitude: 120, longitude: -500 });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/latitude: Latitude must be between -90 and 90; longitude: Longitude must be between/);
    expect(calls).toHaveLength(0);
  });

  it("explains coverage when the location is outside the US (points 404)", async () => {
    const { service } = svc({
      "/points/": () => jsonResponse({ title: "Not Found", detail: "Unable to provide data for requested point" }, 404),
    });
    const r = await handleGetForecast(service, { latitude: 12.9716, longitude: 77.5946 });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/No NWS forecast data for 12.9716, 77.5946.*United States/);
  });

  it("handles a points response without a forecast URL", async () => {
    const { service } = svc({ "/points/": () => jsonResponse({ properties: { gridId: "X" } }) });
    const r = await handleGetForecast(service, { latitude: 40, longitude: -100 });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/did not include a forecast URL/);
  });

  it("handles a forecast response without periods", async () => {
    const { service } = svc({
      "/points/": () => jsonResponse(samplePoints),
      "/forecast": () => jsonResponse({ properties: {} }),
    });
    const r = await handleGetForecast(service, { latitude: 40, longitude: -100 });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/did not contain a 'periods' list/);
  });

  it("handles an empty periods list", async () => {
    const { service } = svc({
      "/points/": () => jsonResponse(samplePoints),
      "/forecast": () => jsonResponse({ properties: { periods: [] } }),
    });
    const r = await handleGetForecast(service, { latitude: 40, longitude: -100 });
    expect(r.isError).toBeUndefined();
    expect(text(r)).toMatch(/returned no forecast periods/);
  });

  it("reports when the forecast endpoint is unavailable", async () => {
    const { service } = svc({
      "/points/": () => jsonResponse(samplePoints),
      "/forecast": () => jsonResponse({ title: "Unexpected Problem" }, 503),
    });
    const r = await handleGetForecast(service, { latitude: 40, longitude: -100 });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/get_forecast failed: NWS API is temporarily unavailable \(HTTP 503\) — Unexpected Problem/);
  });

  it("reports network failures", async () => {
    const { service } = svc({
      "/points/": () => {
        throw new TypeError("getaddrinfo ENOTFOUND api.weather.gov");
      },
    });
    const r = await handleGetForecast(service, { latitude: 40, longitude: -100 });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/Could not reach the NWS API: getaddrinfo ENOTFOUND/);
  });

  it("works without a relativeLocation", async () => {
    const points = { properties: { ...samplePoints.properties, relativeLocation: undefined } };
    const { service } = svc({
      "/points/": () => jsonResponse(points),
      "/forecast": () => jsonResponse(sampleForecast),
    });
    const t = text(await handleGetForecast(service, { latitude: 40, longitude: -100 }));
    expect(t).toContain("Forecast for 40, -100");
  });
});
