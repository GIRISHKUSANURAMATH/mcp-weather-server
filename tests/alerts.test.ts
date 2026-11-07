import { describe, expect, it } from "vitest";
import { WeatherService } from "../src/services/weather-service.js";
import { formatAlerts, handleGetAlerts, MAX_ALERTS } from "../src/tools/alerts.js";
import { jsonResponse, mockFetch, sampleAlerts, testConfig } from "./helpers.js";

const text = (r: { content: Array<{ type: string; text?: string }> }) => r.content.map((c) => c.text).join("");
const svc = (routes: Parameters<typeof mockFetch>[0]) => {
  const m = mockFetch(routes);
  return { service: new WeatherService(testConfig, { fetch: m.fetch, retryDelayMs: 0 }), calls: m.calls };
};

describe("get_alerts", () => {
  it("returns formatted alerts for a valid state", async () => {
    const { service, calls } = svc({ "/alerts/active": () => jsonResponse(sampleAlerts) });
    const r = await handleGetAlerts(service, { state: "ca" });

    expect(r.isError).toBeUndefined();
    const t = text(r);
    expect(t).toContain("Active weather alerts for CA: 2");
    expect(t).toContain("Event: Flood Warning");
    expect(t).toContain("Area: Sacramento; Yolo");
    expect(t).toContain("Severity: Severe");
    expect(t).toContain("Description: Heavy rain has caused flooding");
    expect(t).toContain("Instructions: Turn around, don't drown.");
    expect(t).toContain("Instructions: No specific instructions provided");

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.weather.gov/alerts/active?area=CA");
    const headers = calls[0]!.init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("test-agent/1.0");
    expect(headers.Accept).toBe("application/geo+json");
  });

  it("handles a state with no active alerts", async () => {
    const { service } = svc({ "/alerts/active": () => jsonResponse({ type: "FeatureCollection", features: [] }) });
    const r = await handleGetAlerts(service, { state: "WY" });
    expect(r.isError).toBeUndefined();
    expect(text(r)).toBe("No active weather alerts for WY.");
  });

  it("rejects an invalid state without calling the API", async () => {
    const { service, calls } = svc({});
    const r = await handleGetAlerts(service, { state: "XX" });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/Invalid input: state: Not a recognised/);
    expect(calls).toHaveLength(0);
  });

  it("reports API failures (HTTP 500) after retrying", async () => {
    const { service, calls } = svc({ "/alerts/active": () => jsonResponse({ title: "Server Error" }, 500) });
    const r = await handleGetAlerts(service, { state: "CA" });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/temporarily unavailable \(HTTP 500\)/);
    expect(calls).toHaveLength(2); // 1 attempt + 1 retry
  });

  it("recovers when a retry succeeds", async () => {
    let n = 0;
    const { service } = svc({
      "/alerts/active": () => (++n === 1 ? jsonResponse({}, 503) : jsonResponse(sampleAlerts)),
    });
    const r = await handleGetAlerts(service, { state: "CA" });
    expect(r.isError).toBeUndefined();
    expect(text(r)).toContain("Flood Warning");
  });

  it("reports network failures", async () => {
    const { service } = svc({
      "/alerts/active": () => {
        throw new TypeError("fetch failed");
      },
    });
    const r = await handleGetAlerts(service, { state: "CA" });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/Could not reach the NWS API: fetch failed/);
  });

  it("reports timeouts", async () => {
    const { service } = svc({
      "/alerts/active": () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      },
    });
    const r = await handleGetAlerts(service, { state: "CA" });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/did not respond within 5s/);
  });

  it("does not retry on 4xx and surfaces NWS problem detail", async () => {
    const { service, calls } = svc({
      "/alerts/active": () => jsonResponse({ title: "Bad Request", detail: "Parameter \"area\" is invalid" }, 400),
    });
    const r = await handleGetAlerts(service, { state: "CA" });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/HTTP 400\) — Parameter "area" is invalid/);
    expect(calls).toHaveLength(1);
  });

  it("handles rate limiting", async () => {
    const { service } = svc({ "/alerts/active": () => jsonResponse({}, 429) });
    const r = await handleGetAlerts(service, { state: "CA" });
    expect(text(r)).toMatch(/rate limit/);
  });

  it.each([
    ["missing features", { type: "FeatureCollection" }],
    ["features not a list", { features: "nope" }],
  ])("handles unexpected response shape: %s", async (_label, body) => {
    const { service } = svc({ "/alerts/active": () => jsonResponse(body) });
    const r = await handleGetAlerts(service, { state: "CA" });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/did not contain a 'features' list/);
  });

  it("handles a non-JSON body", async () => {
    const { service } = svc({ "/alerts/active": () => new Response("<html>oops</html>", { status: 200 }) });
    const r = await handleGetAlerts(service, { state: "CA" });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/not valid JSON/);
  });

  it("tolerates malformed individual features", async () => {
    const { service } = svc({
      "/alerts/active": () => jsonResponse({ features: [null, { properties: {} }, { nope: 1 }] }),
    });
    const r = await handleGetAlerts(service, { state: "CA" });
    expect(r.isError).toBeUndefined();
    expect(text(r)).toContain("Active weather alerts for CA: 1");
    expect(text(r)).toContain("Event: Unknown event");
  });

  it(`caps output at ${MAX_ALERTS} alerts`, () => {
    const many = Array.from({ length: MAX_ALERTS + 5 }, (_, i) => ({
      event: `Event ${i}`, areaDesc: "A", severity: "Minor", urgency: "Future", certainty: "Possible",
      headline: null, description: null, instruction: null, effective: null, expires: null, senderName: null,
    }));
    const t = formatAlerts("TX", many);
    expect(t).toContain(`(showing the first ${MAX_ALERTS})`);
    expect(t).toContain(`Event ${MAX_ALERTS - 1}`);
    expect(t).not.toContain(`Event ${MAX_ALERTS}\n`);
  });
});
