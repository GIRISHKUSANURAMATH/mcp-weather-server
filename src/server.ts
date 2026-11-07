import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SERVER_NAME, SERVER_VERSION, type WeatherConfig } from "./config.js";
import { WeatherService, type WeatherServiceOptions } from "./services/weather-service.js";
import { registerAlertsTool } from "./tools/alerts.js";
import { registerForecastTool } from "./tools/forecast.js";

/** Build a fully-registered MCP server. Transport-agnostic, so tests can use an in-memory transport. */
export function createServer(config: WeatherConfig, serviceOptions?: WeatherServiceOptions): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Weather tools backed by the US National Weather Service. Coverage is limited to the United States " +
        "and its territories. Use get_alerts with a 2-letter state code, and get_forecast with decimal coordinates.",
    },
  );

  const service = new WeatherService(config, serviceOptions);
  registerAlertsTool(server, service);
  registerForecastTool(server, service);
  return server;
}
