/**
 * End-to-end smoke test: launches dist/index.js exactly the way Claude Desktop
 * does (a child process over stdio), performs the MCP handshake, lists tools and
 * calls both tools against the REAL National Weather Service API.
 *
 * Run after building:  npm run smoke
 * Exits non-zero if any check fails.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "index.js");

let failures = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (!ok) failures += 1;
  process.stdout.write(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}\n`);
}

function textOf(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
  return content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
}

// Forward the parent environment so NWS_* / LOG_LEVEL overrides reach the server.
const env = Object.fromEntries(
  Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === "string"),
);
const transport = new StdioClientTransport({ command: process.execPath, args: [serverPath], env, stderr: "inherit" });
const client = new Client({ name: "weather-smoke-test", version: "1.0.0" });

try {
  await client.connect(transport);
  const info = client.getServerVersion();
  check("initialize handshake", !!info, `${info?.name} v${info?.version}`);

  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  check("tool discovery", names.join(",") === "get_alerts,get_forecast", names.join(", "));
  const alertsTool = tools.find((t) => t.name === "get_alerts");
  const forecastTool = tools.find((t) => t.name === "get_forecast");
  check("get_alerts schema requires 'state'", !!alertsTool?.inputSchema.required?.includes("state"));
  check(
    "get_forecast schema requires latitude+longitude",
    !!forecastTool?.inputSchema.required?.includes("latitude") && !!forecastTool?.inputSchema.required?.includes("longitude"),
  );

  const alerts = await client.callTool({ name: "get_alerts", arguments: { state: "CA" } });
  const alertsText = textOf(alerts);
  check(
    "get_alerts(CA) via NWS API",
    !alerts.isError && /alerts for CA/i.test(alertsText),
    alertsText.split("\n")[0],
  );

  const forecast = await client.callTool({ name: "get_forecast", arguments: { latitude: 38.5816, longitude: -121.4944 } });
  const forecastText = textOf(forecast);
  check(
    "get_forecast(Sacramento) via NWS API",
    !forecast.isError && /Temperature:/.test(forecastText),
    forecastText.split("\n")[0],
  );

  const bad = await client.callTool({ name: "get_alerts", arguments: { state: "ZZ" } });
  check("invalid state rejected", bad.isError === true, textOf(bad).slice(0, 120));

  const outside = await client.callTool({ name: "get_forecast", arguments: { latitude: 12.9716, longitude: 77.5946 } });
  check("non-US coordinates handled gracefully", outside.isError === true, textOf(outside).slice(0, 120));

  if (process.argv.includes("--print")) {
    process.stdout.write(`\n===== get_alerts CA =====\n${alertsText.slice(0, 1500)}\n`);
    process.stdout.write(`\n===== get_forecast Sacramento =====\n${forecastText.slice(0, 1500)}\n`);
  }
} catch (err) {
  check("smoke test ran without crashing", false, (err as Error).message);
} finally {
  await client.close().catch(() => undefined);
}

process.stdout.write(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
