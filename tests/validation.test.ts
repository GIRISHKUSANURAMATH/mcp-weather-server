import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import {
  alertsInputSchema,
  forecastInputSchema,
  formatZodError,
  normaliseCoordinate,
  US_STATE_CODES,
} from "../src/utils/validation.js";

describe("state code validation", () => {
  it.each(["CA", "ny", " tx ", "Dc", "PR"])("accepts %j and normalises to upper case", (input) => {
    const r = alertsInputSchema.safeParse({ state: input });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.state).toBe(input.trim().toUpperCase());
  });

  it("covers 50 states, DC and 5 territories", () => {
    expect(new Set(US_STATE_CODES).size).toBe(56);
  });

  it.each([
    ["ZZ", /recognised/],
    ["C", /exactly 2/],
    ["CAL", /exactly 2/],
    ["C1", /letters only/],
    ["", /exactly 2/],
  ])("rejects %j", (input, msg) => {
    const r = alertsInputSchema.safeParse({ state: input });
    expect(r.success).toBe(false);
    if (!r.success) expect(formatZodError(r.error)).toMatch(msg);
  });

  it.each([[42], [null], [undefined], [["CA"]]])("rejects non-string %j", (input) => {
    expect(alertsInputSchema.safeParse({ state: input }).success).toBe(false);
  });
});

describe("coordinate validation", () => {
  it.each([
    [38.5816, -121.4944],
    [90, 180],
    [-90, -180],
    [0, 0],
  ])("accepts (%d, %d)", (latitude, longitude) => {
    expect(forecastInputSchema.safeParse({ latitude, longitude }).success).toBe(true);
  });

  it.each([
    [{ latitude: 91, longitude: 0 }, /Latitude must be between/],
    [{ latitude: -90.01, longitude: 0 }, /Latitude must be between/],
    [{ latitude: 0, longitude: 180.5 }, /Longitude must be between/],
    [{ latitude: 0, longitude: -181 }, /Longitude must be between/],
    [{ latitude: "38.5", longitude: -121 }, /latitude/i],
    [{ latitude: Number.NaN, longitude: -121 }, /latitude/i],
    [{ latitude: Number.POSITIVE_INFINITY, longitude: -121 }, /latitude/i],
    [{ longitude: -121 }, /latitude/i],
  ])("rejects %j", (input, msg) => {
    const r = forecastInputSchema.safeParse(input);
    expect(r.success).toBe(false);
    if (!r.success) expect(formatZodError(r.error)).toMatch(msg);
  });

  it("rounds to 4 decimal places for the NWS points endpoint", () => {
    expect(normaliseCoordinate(38.581572)).toBe(38.5816);
    expect(normaliseCoordinate(-121.49440001)).toBe(-121.4944);
    expect(normaliseCoordinate(40)).toBe(40);
  });
});

describe("config", () => {
  it("uses safe defaults with no env vars", () => {
    const c = loadConfig({});
    expect(c.apiBase).toBe("https://api.weather.gov");
    expect(c.userAgent).toMatch(/^mcp-weather-server\//);
    expect(c.timeoutMs).toBe(15_000);
    expect(c.maxRetries).toBe(1);
  });

  it("reads overrides and ignores invalid numbers", () => {
    const c = loadConfig({ NWS_API_BASE: "http://localhost:9999/", NWS_USER_AGENT: "x", NWS_TIMEOUT_MS: "abc", NWS_MAX_RETRIES: "3" });
    expect(c.apiBase).toBe("http://localhost:9999");
    expect(c.userAgent).toBe("x");
    expect(c.timeoutMs).toBe(15_000);
    expect(c.maxRetries).toBe(3);
  });
});
