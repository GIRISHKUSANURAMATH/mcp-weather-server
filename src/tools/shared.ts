import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { WeatherServiceError } from "../services/weather-service.js";
import { logger } from "../utils/logger.js";

export function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

/**
 * Tool-level errors are returned as results with isError: true (not thrown),
 * so the model can see what went wrong and react, per the MCP spec.
 */
export function errorResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

export function toErrorResult(tool: string, err: unknown): CallToolResult {
  if (err instanceof WeatherServiceError) {
    logger.warn(`${tool} failed`, { kind: err.kind, status: err.status, message: err.message });
    return errorResult(`${tool} failed: ${err.message}`);
  }
  logger.error(`${tool} crashed with an unexpected error`, {
    message: (err as Error)?.message ?? String(err),
    stack: (err as Error)?.stack,
  });
  return errorResult(`${tool} failed due to an unexpected internal error. Check the server logs for details.`);
}

/** Collapse whitespace runs and cap length so huge NWS texts don't flood the context window. */
export function clip(text: string, max: number): string {
  const tidy = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return tidy.length > max ? `${tidy.slice(0, max - 1).trimEnd()}…` : tidy;
}
