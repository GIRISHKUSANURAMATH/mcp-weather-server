# Weather MCP Server (NWS)

A [Model Context Protocol](https://modelcontextprotocol.io) server that gives Claude live US weather data from the **National Weather Service (NWS) API**. It is packaged as a one-click **Claude Desktop extension** (`.mcpb`) and exposes two tools:

| Tool | Input | Returns |
|---|---|---|
| `get_alerts` | `state`: two-letter US state/territory code (`TX`, `CA`, `NY`, `DC`, `PR`, …) | Active warnings, watches and advisories: event, affected areas, severity, urgency, certainty, headline, description, instructions, effective/expiry times |
| `get_forecast` | `latitude`, `longitude`: decimal degrees | Up to 14 twelve-hour periods (~7 days): temperature, conditions, wind speed and direction, chance of precipitation, detailed text |

No API key is needed. The NWS API is free and public.

---

## Features

- **Two MCP tools** registered with the official TypeScript SDK (`McpServer.registerTool`), with JSON-Schema inputs Claude can read.
- **Strict input validation** (Zod): only real US state/territory codes, latitude −90…90, longitude −180…180. Bad input is rejected before any network call.
- **Correct NWS workflow**: `/points/{lat},{lon}`, then the forecast URL that response returns. No hard-coded grid URLs.
- **Resilient networking**: 15 s timeout, one retry on network errors, timeouts and 5xx responses, and clear messages for 404 / 429 / unexpected or non-JSON responses.
- **MCP-correct errors**: failures come back as tool results with `isError: true`, so Claude can explain them.
- **Readable output**: long NWS texts are trimmed and output is capped at 20 alerts, so Claude's context isn't flooded.
- **stdio-safe logging**: all diagnostics go to stderr, and stdout carries only the protocol.
- **Single-file bundle**: `dist/index.js` has no runtime `node_modules` dependency.
- **60 automated tests**: unit tests plus MCP client↔server integration tests, with the NWS API mocked.

## Screenshots

> _Screenshots are not included yet. Suggested captures:_
>
> 1. _Claude Desktop → Settings → Desktop app → Extensions, showing **Weather (NWS)** enabled_
> 2. _A chat where Claude calls `get_alerts` for a state_
> 3. _A chat where Claude calls `get_forecast` for a city_
>
> _To add them, save PNGs under `docs/screenshots/` and reference them here, e.g. `![Extension enabled](docs/screenshots/extension.png)`._

## Technology stack

| Component | Version / detail |
|---|---|
| Runtime | Node.js ≥ 20 (ES modules) |
| Language | TypeScript 7, strict mode |
| MCP SDK | [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk) 1.32.2, stdio transport |
| Validation | Zod 4 |
| HTTP | Native `fetch` + `AbortSignal.timeout` |
| Bundler | esbuild |
| Tests | Vitest |
| Packaging | [MCPB](https://github.com/modelcontextprotocol/mcpb) (Claude Desktop extensions), manifest v0.3 |

## Project structure

```
.
├── src/
│   ├── index.ts                     # Entry point: stdio transport, graceful shutdown
│   ├── server.ts                    # Creates the McpServer and registers both tools
│   ├── config.ts                    # Optional env-var configuration with defaults
│   ├── tools/
│   │   ├── alerts.ts                # get_alerts: schema, handler, formatter
│   │   ├── forecast.ts              # get_forecast: schema, handler, formatter
│   │   └── shared.ts                # Result helpers, error mapping, text trimming
│   ├── services/
│   │   └── weather-service.ts       # NWS HTTP client: timeouts, retries, parsing
│   └── utils/
│       ├── validation.ts            # Zod schemas: state codes, coordinates
│       └── logger.ts                # stderr-only logger
├── tests/                           # Vitest unit + integration tests (NWS mocked)
├── scripts/
│   ├── build.mjs                    # esbuild → dist/index.js, dist/smoke-test.js
│   ├── smoke-test.ts                # Runs the built server over stdio against the LIVE NWS API
│   ├── pack-mcpb.mjs                # Builds weather-nws.mcpb from dist/ + extension/manifest.json
│   └── configure-claude-desktop.mjs # Legacy: config-file setup for older Claude Desktop builds
├── extension/
│   └── manifest.json                # MCPB extension manifest
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env.example                     # Optional settings (none are required)
├── CHANGELOG.md
├── CONTRIBUTING.md
└── LICENSE
```

`dist/`, `node_modules/` and `*.mcpb` are build outputs and are git-ignored.

## Prerequisites

- **Claude Desktop** (Windows or macOS), to use the extension.
- **Node.js 20+** and npm, only to build, test or develop. [Download Node.js](https://nodejs.org/).
- Internet access to `https://api.weather.gov`.

## Installation

### Option 1: Install the extension (recommended)

1. Download `weather-nws.mcpb` from this repository's **Releases** page, or build it yourself (Option 2).
2. In Claude Desktop, open **Settings → Desktop app** and click **Manage** next to **Extensions**.
   _(Older layouts: **Settings → Extensions**.)_
3. Click **Advanced settings**. Under **Extension Developer**, click **Install Extension…**
4. Select `weather-nws.mcpb` and approve the prompts. The package is unsigned, so Claude Desktop may show a warning.
5. Make sure **Weather (NWS)** is enabled. Its status appears under **Local MCP servers** on the Extensions page.
6. In a chat, click **+** → **Connectors** to confirm that `get_alerts` and `get_forecast` are listed.

Claude Desktop runs the extension with its built-in Node.js, so you don't need to install Node separately for this option.

### Option 2: Build from source

```bash
git clone https://github.com/<your-username>/<repo-name>.git
cd <repo-name>
npm install
npm run verify        # typecheck + 60 tests + build
npm run pack:mcpb     # creates weather-nws.mcpb in the project root
```

Then install `weather-nws.mcpb` as in Option 1. `pack:mcpb` runs the official MCPB CLI (`@anthropic-ai/mcpb`, pinned) through `npx`. It validates the manifest and packs `extension/` together with the bundled server.

### Other MCP clients

Any stdio MCP client can launch the bundled server directly:

```json
{
  "mcpServers": {
    "weather": {
      "command": "node",
      "args": ["/absolute/path/to/repo/dist/index.js"]
    }
  }
}
```

On Windows, use doubled backslashes in JSON, e.g. `"C:\\path\\to\\repo\\dist\\index.js"`.

> **Note for Claude Desktop:** recent Claude Desktop builds no longer load servers listed under `mcpServers` in `claude_desktop_config.json`. Install the `.mcpb` extension instead. `scripts/configure-claude-desktop.mjs` is kept only for older builds that still read that file.

## Usage

Ask Claude in plain language, and it will choose the tool:

- *"Are there any active weather alerts in Texas?"*
- *"What's the forecast for New York City (40.7128, -74.0060)?"*

### `get_alerts`

**Input**

```json
{ "state": "TX" }
```

Accepts the 50 states, `DC`, and the territories `PR`, `VI`, `GU`, `AS`, `MP`. Case and surrounding spaces don't matter (`" tx "` → `TX`).

**Example output.** This is an excerpt from a real call on 7 Nov 2026 that returned 3 alerts. Live data changes constantly.

```
Active weather alerts for TX: 3

--- Alert 1 of 3 ---
Event: Dense Fog Advisory
Area: Harper; Woods; Alfalfa; … Hardeman; Wilbarger
Severity: Moderate | Urgency: Expected | Certainty: Likely
Headline: Dense Fog Advisory issued November 7 at 9:52AM CST until November 7 at 11:00AM CST by NWS Norman OK
Effective: 2026-11-07T09:52:00-06:00 | Expires: 2026-11-07T11:00:00-06:00
Description: * WHAT...Visibility less than one mile in dense fog. …
Instructions: If driving, slow down, use your headlights, and leave plenty of distance ahead of you.
Issued by: NWS Norman OK

--- Alert 3 of 3 ---
Event: Flood Watch
Area: La Salle; McMullen; Live Oak; Bee; Goliad; Webb; Duval; …
Severity: Severe | Urgency: Future | Certainty: Possible
Headline: Flood Watch issued November 6 at 8:17PM CST until November 9 at 12:00PM CST by NWS Corpus Christi TX
…
```

When a state has no alerts, the tool returns `No active weather alerts for WY.`

> The `Expires` field is the NWS message's own expiry, which is often when NWS will reissue it, not the end of the hazard. Use the end time in the **Headline** for the hazard itself.

### `get_forecast`

**Input**

```json
{ "latitude": 40.7128, "longitude": -74.006 }
```

**Example output.** This is an excerpt from a real call on 7 Nov 2026. The full response has 14 periods.

```
Forecast for New York, NY (40.7128, -74.006)
NWS grid: OKX 33,42 | Updated: 2026-11-07T07:00:48+00:00

Today:
  Temperature: 63°F
  Conditions: Mostly Sunny
  Wind: 8 to 16 mph W
  Chance of precipitation: 1%
  Details: Mostly sunny. High near 63, with temperatures falling to around 59 in the afternoon. West wind 8 to 16 mph.

Tonight:
  Temperature: 48°F
  Conditions: Partly Cloudy
  Wind: 16 mph W
  Chance of precipitation: 9%
  Details: Partly cloudy, with a low around 48. West wind around 16 mph.
…
```

Handy US test coordinates: New York `40.7128, -74.0060` · Chicago `41.8781, -87.6298` · Sacramento `38.5816, -121.4944` · Miami `25.7617, -80.1918` · Honolulu `21.3069, -157.8583`.

### Error examples

| Input | Result (`isError: true`) |
|---|---|
| `{ "state": "ZZ" }` | `Not a recognised US state or territory code (e.g. CA, NY, TX, DC, PR)` |
| `{ "latitude": 120, "longitude": 0 }` | `Latitude must be between -90 and 90` |
| `{ "latitude": 12.9716, "longitude": 77.5946 }` (Bengaluru) | `No NWS forecast data for 12.9716, 77.5946. The NWS only covers the United States and its territories.` |

## How the NWS API works

The [NWS API](https://www.weather.gov/documentation/services-web-api) is a free, keyless REST/GeoJSON service. NWS asks every client to send a `User-Agent` header that identifies it, and this server always sends one.

- **Alerts:** `GET https://api.weather.gov/alerts/active?area={STATE}` returns a GeoJSON `FeatureCollection`. Each feature's `properties` hold `event`, `areaDesc`, `severity`, `headline`, `description`, `instruction`, and so on.
- **Forecast (two steps):**
  1. `GET https://api.weather.gov/points/{lat},{lon}` maps a coordinate to its forecast office and grid cell, and returns `properties.forecast`, the forecast URL for that cell.
  2. `GET {that URL}` returns `properties.periods`, the 12-hour forecast periods.

Coordinates are rounded to 4 decimal places (about 11 m) before step 1, because `/points` rejects more precise values.

## Coverage and limitations

- **US only.** NWS covers the 50 states, DC and US territories. Any other location returns a clear "outside NWS coverage" error.
- **Forecast granularity.** The tool returns the 12-hour forecast, not the hourly forecast, observations or radar.
- **Output caps.** At most 20 alerts are shown in full (the total count is always reported), and long descriptions are trimmed.
- **Upstream availability.** NWS has occasional outages (HTTP 500/503). The server retries once, then reports the error.
- **Rate limits.** NWS doesn't publish fixed limits but may return 429 under heavy use. The server reports it clearly.

## Configuration (optional)

None of these are needed. See `.env.example`. The server reads real environment variables, not a `.env` file.

| Variable | Default | Purpose |
|---|---|---|
| `NWS_USER_AGENT` | `mcp-weather-server/1.0.0 (local MCP server)` | Identifies your client to NWS. Adding a contact, e.g. `my-app/1.0 (you@example.com)`, is good practice. |
| `NWS_API_BASE` | `https://api.weather.gov` | Override only to test against a mock |
| `NWS_TIMEOUT_MS` | `15000` | Per-request timeout (1000–120000) |
| `NWS_MAX_RETRIES` | `1` | Retries on network error, timeout or 5xx (0–5) |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` or `silent` (stderr) |

## Testing

```bash
npm run typecheck      # TypeScript strict type check
npm test               # 60 unit + integration tests (NWS API mocked, no network)
npm run build          # bundle to dist/
npm run smoke          # run the built server over stdio against the LIVE NWS API
npm run verify         # typecheck + test + build
```

The tests cover:
- valid and invalid state codes and coordinates
- successful alert and forecast retrieval
- states with no alerts and empty forecasts
- HTTP 400, 404, 429, 500 and 503 responses, with and without a successful retry
- network failures and timeouts
- malformed and non-JSON responses
- a real MCP client listing and calling both tools over an in-memory transport

`npm run smoke` launches `dist/index.js` the way an MCP client does. It checks the MCP handshake, tool discovery, both input schemas, live `get_alerts(CA)` and `get_forecast(Sacramento)` calls, invalid-input rejection and the non-US error. Add `-- --print` to see the full output.

To explore the server interactively with the official [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npm run inspector
# or, without a browser:
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/list
npx @modelcontextprotocol/inspector --cli node dist/index.js --method tools/call --tool-name get_alerts --tool-arg state=TX
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Tools don't appear in Claude Desktop; "No matching tools found" | The extension isn't installed or enabled, or it was added to `claude_desktop_config.json`, which recent builds ignore | Install `weather-nws.mcpb` via **Settings → Desktop app → Extensions**, and check that **Weather (NWS)** is enabled |
| No **Developer** section or **Edit Config** button in Settings | Newer Claude Desktop layout | Use **Settings → Desktop app → Extensions → Manage → Advanced settings** |
| Extension installed but shows an error | Startup failure | Open the extension's logs from the **Local MCP servers** section of the Extensions page, and check that the `.mcpb` was built from a successful `npm run build` |
| `No NWS forecast data for …` | Coordinates outside the US | Use US coordinates |
| `Could not reach the NWS API` | No internet, or a firewall/proxy is blocking it | Check that `https://api.weather.gov` opens in a browser |
| `NWS API is temporarily unavailable (HTTP 5xx)` | NWS outage | Retry later, or raise `NWS_MAX_RETRIES` |
| `npm` blocked in PowerShell (`running scripts is disabled`) | PowerShell execution policy | Use `npm.cmd …`, or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `dist/index.js not found` when packing | You haven't built yet | `npm run build`, then `npm run pack:mcpb` |

To check the server on its own, run it directly:

```bash
node dist/index.js
```

It should print `Weather MCP server v1.0.0 running on stdio` to stderr and then wait for input, which is correct. Press `Ctrl+C` to exit. Set `LOG_LEVEL=debug` to log every NWS request with its status and timing.

## Extending

1. Add a method to `WeatherService` in `src/services/weather-service.ts`.
2. Create `src/tools/<name>.ts` following `alerts.ts`: a Zod input shape, a `handle…(service, args)` function, a formatter, and a `register…Tool(server, service)` function.
3. Register the tool in `src/server.ts`, and list it in `extension/manifest.json` under `tools`.
4. Add tests using `mockFetch` from `tests/helpers.ts`.
5. Run `npm run verify && npm run pack:mcpb`, then reinstall the extension.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the guidelines.

## License

[MIT](LICENSE) © 2026 Girish Kusanuramath

Weather data comes from the [US National Weather Service](https://www.weather.gov/). This project is not affiliated with or endorsed by NWS or NOAA.
