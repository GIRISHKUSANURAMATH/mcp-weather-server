// Bundles the server (and the smoke-test client) into self-contained files in dist/.
// The bundled dist/index.js has no runtime dependency on node_modules, so
// Claude Desktop can launch it with plain `node`.
import { build } from "esbuild";
import { rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });

const common = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  sourcemap: false,
  legalComments: "none",
  // Some bundled CommonJS deps call require(); give ESM output a working one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "info",
};

await build({ ...common, entryPoints: ["src/index.ts"], outfile: "dist/index.js" });
await build({ ...common, entryPoints: ["scripts/smoke-test.ts"], outfile: "dist/smoke-test.js" });
