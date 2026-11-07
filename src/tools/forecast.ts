import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Forecast, ForecastPeriod, WeatherService } from "../services/weather-service.js";
import { formatZodError, forecastInputSchema, forecastInputShape, normaliseCoordinate } from "../utils/validation.js";
import { clip, errorResult, textResult, toErrorResult } from "./shared.js";

/** NWS returns 14 twelve-hour periods (~7 days). */
export const MAX_PERIODS = 14;

export function formatPeriod(p: ForecastPeriod): string {
  const temp = p.temperature === null ? "n/a" : `${p.temperature}°${p.temperatureUnit}`;
  const wind = [p.windSpeed, p.windDirection].filter(Boolean).join(" ");
  const lines = [
    `${p.name}:`,
    `  Temperature: ${temp}`,
    `  Conditions: ${p.shortForecast}`,
    `  Wind: ${wind || "n/a"}`,
  ];
  if (p.probabilityOfPrecipitation !== null) {
    lines.push(`  Chance of precipitation: ${p.probabilityOfPrecipitation}%`);
  }
  if (p.detailedForecast) lines.push(`  Details: ${clip(p.detailedForecast, 500)}`);
  return lines.join("\n");
}

export function formatForecast(latitude: number, longitude: number, forecast: Forecast): string {
  const where = forecast.location ? `${forecast.location} (${latitude}, ${longitude})` : `${latitude}, ${longitude}`;
  if (forecast.periods.length === 0) {
    return `The NWS returned no forecast periods for ${where}. The forecast may be temporarily unavailable.`;
  }
  const header = [
    `Forecast for ${where}`,
    `NWS grid: ${forecast.gridId} ${forecast.gridX},${forecast.gridY}` +
      (forecast.updated ? ` | Updated: ${forecast.updated}` : ""),
  ].join("\n");
  const periods = forecast.periods.slice(0, MAX_PERIODS).map(formatPeriod).join("\n\n");
  return `${header}\n\n${periods}`;
}

export async function handleGetForecast(service: WeatherService, args: unknown) {
  const parsed = forecastInputSchema.safeParse(args);
  if (!parsed.success) return errorResult(`Invalid input: ${formatZodError(parsed.error)}`);

  const { latitude, longitude } = parsed.data;
  try {
    const forecast = await service.getForecast(latitude, longitude);
    return textResult(formatForecast(normaliseCoordinate(latitude), normaliseCoordinate(longitude), forecast));
  } catch (err) {
    return toErrorResult("get_forecast", err);
  }
}

export function registerForecastTool(server: McpServer, service: WeatherService): void {
  server.registerTool(
    "get_forecast",
    {
      title: "Get weather forecast",
      description:
        "Get the US National Weather Service forecast for a latitude/longitude inside the United States or its " +
        "territories. Returns up to 7 days of 12-hour periods with temperature, conditions, wind speed and direction.",
      inputSchema: forecastInputShape,
      annotations: { readOnlyHint: true, openWorldHint: true, idempotentHint: true },
    },
    async (args) => handleGetForecast(service, args),
  );
}
