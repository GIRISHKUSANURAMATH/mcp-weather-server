/**
 * Minimal logger that writes ONLY to stderr.
 *
 * With the stdio transport, stdout carries the JSON-RPC protocol stream.
 * Anything else printed to stdout would corrupt it, so never use console.log
 * in this server. Claude Desktop captures stderr into its MCP log files.
 */

type Level = "debug" | "info" | "warn" | "error";
type Threshold = Level | "silent";

const ORDER: Record<Threshold, number> = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

function threshold(): number {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase() as Threshold;
  return ORDER[raw] ?? ORDER.info;
}

function write(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (ORDER[level] < threshold()) return;
  const line = `[${new Date().toISOString()}] [weather] ${level.toUpperCase()} ${message}`;
  process.stderr.write(meta ? `${line} ${safeJson(meta)}\n` : `${line}\n`);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => write("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => write("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write("error", msg, meta),
};
