/**
 * In-process MCP integration test: a real MCP Client talks to the real server
 * through the SDK's in-memory transport. Only the NWS HTTP layer is mocked.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../src/server.js";
import { jsonResponse, mockFetch, sampleAlerts, sampleForecast, samplePoints, testConfig } from "./helpers.js";

let client: Client;

beforeEach(async () => {
  const { fetch } = mockFetch({
    "/alerts/active": () => jsonResponse(sampleAlerts),
    "/points/": () => jsonResponse(samplePoints),
    "/forecast": () => jsonResponse(sampleForecast),
  });
  const server = createServer(testConfig, { fetch, retryDelayMs: 0 });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
});

afterEach(async () => {
  await client.close();
});

const text = (r: unknown) =>
  ((r as { content: Array<{ text?: string }> }).content ?? []).map((c) => c.text).join("");

describe("MCP server", () => {
  it("initialises with server info and tools capability", () => {
    expect(client.getServerVersion()).toMatchObject({ name: "weather", version: "1.0.0" });
    expect(client.getServerCapabilities()?.tools).toBeDefined();
    expect(client.getInstructions()).toMatch(/National Weather Service/);
  });

  it("exposes exactly get_alerts and get_forecast with correct input schemas", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["get_alerts", "get_forecast"]);

    const alerts = tools.find((t) => t.name === "get_alerts")!;
    expect(alerts.description).toMatch(/alerts/i);
    expect(alerts.inputSchema.type).toBe("object");
    expect(alerts.inputSchema.required).toEqual(["state"]);
    expect(alerts.inputSchema.properties).toHaveProperty("state");
    expect(alerts.annotations?.readOnlyHint).toBe(true);

    const forecast = tools.find((t) => t.name === "get_forecast")!;
    expect(forecast.inputSchema.required?.sort()).toEqual(["latitude", "longitude"]);
    const props = forecast.inputSchema.properties as Record<string, { type?: string; minimum?: number; maximum?: number }>;
    expect(props.latitude).toMatchObject({ type: "number", minimum: -90, maximum: 90 });
    expect(props.longitude).toMatchObject({ type: "number", minimum: -180, maximum: 180 });
  });

  it("executes get_alerts", async () => {
    const r = await client.callTool({ name: "get_alerts", arguments: { state: "CA" } });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain("Event: Flood Warning");
  });

  it("executes get_forecast", async () => {
    const r = await client.callTool({ name: "get_forecast", arguments: { latitude: 38.5816, longitude: -121.4944 } });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain("Temperature: 48°F");
  });

  it("returns a tool error (not a protocol error) for invalid arguments", async () => {
    const r = await client.callTool({ name: "get_alerts", arguments: { state: "California" } });
    expect(r.isError).toBe(true);
    expect(text(r)).toMatch(/2 letters/);

    const r2 = await client.callTool({ name: "get_forecast", arguments: { latitude: "abc", longitude: 0 } });
    expect(r2.isError).toBe(true);
  });

  it("rejects an unknown tool", async () => {
    const r = await client.callTool({ name: "get_weather", arguments: {} }).catch((e: Error) => e);
    const msg = r instanceof Error ? r.message : text(r);
    expect(msg).toMatch(/not found|unknown/i);
  });
});
