# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-07

### Added
- MCP server (official TypeScript SDK, stdio transport) with two tools:
  - `get_alerts`: active NWS alerts for a US state or territory code.
  - `get_forecast`: NWS 12-hour forecast periods for a US latitude/longitude, using the documented `/points`-then-forecast-URL workflow.
- Zod input validation for state codes and coordinates.
- Timeouts, one retry on network errors, timeouts and 5xx responses, and clear error messages for 4xx, 429 and malformed responses. Errors are returned as `isError` tool results.
- stderr-only logger and optional environment-variable configuration.
- 60 Vitest unit and integration tests, with the NWS API mocked.
- Live smoke test (`npm run smoke`) that runs the built server over stdio against the real NWS API.
- Claude Desktop extension packaging: `extension/manifest.json` (MCPB v0.3) and `npm run pack:mcpb`.
