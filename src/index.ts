#!/usr/bin/env node
/**
 * Entry point: runs the weather MCP server over stdio, which is how
 * Claude Desktop launches and talks to local MCP servers.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, SERVER_VERSION } from "./config.js";
import { createServer } from "./server.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const server = createServer(config);
  const transport = new StdioServerTransport();

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down`);
    try {
      await server.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  // Claude Desktop closes stdin when it stops the server.
  process.stdin.on("close", () => void shutdown("stdin close"));

  await server.connect(transport);
  logger.info(`Weather MCP server v${SERVER_VERSION} running on stdio`, {
    apiBase: config.apiBase,
    node: process.version,
  });
}

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", { reason: String(reason) });
});

main().catch((err) => {
  logger.error("Fatal error starting server", { message: (err as Error)?.message, stack: (err as Error)?.stack });
  process.exit(1);
});
