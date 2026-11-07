// Builds the Claude Desktop extension (weather-nws.mcpb) from the bundled server.
//   npm run build && npm run pack:mcpb
// Copies dist/index.js into extension/server/, validates extension/manifest.json
// with the official MCPB CLI (via npx), then packs extension/ into weather-nws.mcpb.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = join(root, "dist", "index.js");
const extDir = join(root, "extension");
const out = join(root, "weather-nws.mcpb");

if (!existsSync(bundle)) {
  console.error("dist/index.js not found. Run `npm run build` first.");
  process.exit(1);
}

// Keep manifest version in sync with package.json.
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(extDir, "manifest.json"), "utf8"));
if (manifest.version !== pkg.version) {
  console.error(`Version mismatch: package.json ${pkg.version} vs extension/manifest.json ${manifest.version}`);
  process.exit(1);
}

mkdirSync(join(extDir, "server"), { recursive: true });
copyFileSync(bundle, join(extDir, "server", "index.js"));

// The official MCPB CLI, pinned. Run through npx rather than installed as a dependency
// so its own transitive dependencies never enter this project's lockfile.
const MCPB = "@anthropic-ai/mcpb@2.1.2";
// Paths are passed relative to the project root so folder names with spaces are safe.
const run = (args) => execSync(`npx -y ${MCPB} ${args}`, { stdio: "inherit", cwd: root });
run("validate extension/manifest.json");
run("pack extension weather-nws.mcpb");
console.log(`\nBuilt ${out}`);
