import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { WeatherAlert, WeatherService } from "../services/weather-service.js";
import { alertsInputSchema, alertsInputShape, formatZodError } from "../utils/validation.js";
import { clip, errorResult, textResult, toErrorResult } from "./shared.js";

/** Maximum alerts rendered in one response; the rest are summarised by count. */
export const MAX_ALERTS = 20;
const MAX_DESCRIPTION_CHARS = 1_200;
const MAX_INSTRUCTION_CHARS = 800;

export function formatAlert(alert: WeatherAlert): string {
  const lines = [
    `Event: ${alert.event}`,
    `Area: ${alert.areaDesc}`,
    `Severity: ${alert.severity} | Urgency: ${alert.urgency} | Certainty: ${alert.certainty}`,
  ];
  if (alert.headline) lines.push(`Headline: ${clip(alert.headline, 300)}`);
  if (alert.effective || alert.expires) {
    lines.push(`Effective: ${alert.effective ?? "n/a"} | Expires: ${alert.expires ?? "n/a"}`);
  }
  lines.push(`Description: ${alert.description ? clip(alert.description, MAX_DESCRIPTION_CHARS) : "No description provided"}`);
  lines.push(`Instructions: ${alert.instruction ? clip(alert.instruction, MAX_INSTRUCTION_CHARS) : "No specific instructions provided"}`);
  if (alert.senderName) lines.push(`Issued by: ${alert.senderName}`);
  return lines.join("\n");
}

export function formatAlerts(state: string, alerts: WeatherAlert[]): string {
  if (alerts.length === 0) {
    return `No active weather alerts for ${state}.`;
  }
  const shown = alerts.slice(0, MAX_ALERTS);
  const header = `Active weather alerts for ${state}: ${alerts.length}` +
    (alerts.length > shown.length ? ` (showing the first ${shown.length})` : "");
  const body = shown.map((a, i) => `--- Alert ${i + 1} of ${alerts.length} ---\n${formatAlert(a)}`).join("\n\n");
  return `${header}\n\n${body}`;
}

/** Core handler, separated from registration so it can be unit-tested directly. */
export async function handleGetAlerts(service: WeatherService, args: unknown) {
  const parsed = alertsInputSchema.safeParse(args);
  if (!parsed.success) return errorResult(`Invalid input: ${formatZodError(parsed.error)}`);

  try {
    const alerts = await service.getAlerts(parsed.data.state);
    return textResult(formatAlerts(parsed.data.state, alerts));
  } catch (err) {
    return toErrorResult("get_alerts", err);
  }
}

export function registerAlertsTool(server: McpServer, service: WeatherService): void {
  server.registerTool(
    "get_alerts",
    {
      title: "Get weather alerts",
      description:
        "Get active weather alerts (warnings, watches, advisories) issued by the US National Weather Service " +
        "for a US state or territory. Returns event type, affected area, severity, description and instructions.",
      inputSchema: alertsInputShape,
      annotations: { readOnlyHint: true, openWorldHint: true, idempotentHint: true },
    },
    async (args) => handleGetAlerts(service, args),
  );
}
