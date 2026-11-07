# Contributing

Thanks for your interest in improving the Weather MCP Server. Issues and pull requests are welcome.

## Reporting issues

Please include:
- what you asked Claude, or the exact tool input (`state`, or `latitude`/`longitude`);
- the tool output or error text;
- your OS, your Claude Desktop version, and `node -v` if you built from source.

Leave out personal details and any private configuration files.

## Development setup

```bash
npm install
npm run verify      # typecheck + tests + build
npm run smoke       # optional: live check against api.weather.gov
```

## Guidelines

- **Never write to stdout** from server code. stdout carries the MCP protocol, so use `logger` from `src/utils/logger.ts`, which writes to stderr.
- **Return tool errors, don't throw them.** Use `errorResult` / `toErrorResult` from `src/tools/shared.ts` so the client gets `isError: true` with a readable message.
- **Validate all input** with Zod schemas in `src/utils/validation.ts` before any network call.
- **Keep the NWS workflow correct.** Get forecast URLs from the `/points` response, never hard-code them, and always send the `User-Agent` header.
- **Add tests** for new behaviour in `tests/`, using `mockFetch` from `tests/helpers.ts`. Unit tests must not hit the real network.
- **Keep output compact.** Tool results go into the model's context.
- If you add or rename a tool, update `extension/manifest.json`, `README.md` and `CHANGELOG.md`.
- Keep the version in `package.json` and `extension/manifest.json` in sync. `npm run pack:mcpb` refuses to build if they differ.

## Pull requests

1. Create a branch from `main`.
2. Make focused commits with clear messages.
3. Make sure `npm run verify` passes.
4. Describe what changed and how you tested it.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
