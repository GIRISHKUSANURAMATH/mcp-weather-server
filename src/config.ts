/**
 * Runtime configuration, read from environment variables with safe defaults.
 * Nothing here is required: the server works out of the box with no env vars.
 */

export interface WeatherConfig {
  /** Base URL of the NWS API. */
  apiBase: string;
  /** User-Agent sent to NWS. NWS asks clients to identify themselves. */
  userAgent: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs: number;
  /** How many times to retry a request after a network error or 5xx response. */
  maxRetries: number;
}

export const SERVER_NAME = "weather";
export const SERVER_VERSION = "1.0.0";

const DEFAULT_USER_AGENT = `mcp-weather-server/${SERVER_VERSION} (local MCP server)`;

function readInt(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WeatherConfig {
  const apiBase = (env.NWS_API_BASE?.trim() || "https://api.weather.gov").replace(/\/+$/, "");
  return {
    apiBase,
    userAgent: env.NWS_USER_AGENT?.trim() || DEFAULT_USER_AGENT,
    timeoutMs: readInt(env.NWS_TIMEOUT_MS, 15_000, 1_000, 120_000),
    maxRetries: readInt(env.NWS_MAX_RETRIES, 1, 0, 5),
  };
}
