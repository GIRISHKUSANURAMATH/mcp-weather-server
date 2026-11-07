#!/usr/bin/env node
/**
 * LEGACY: registers this server via claude_desktop_config.json.
 *
 * Recent Claude Desktop builds no longer load `mcpServers` from that file; install the
 * extension instead (npm run pack:mcpb, then Settings → Desktop app → Extensions).
 * This script is kept for older Claude Desktop builds that still read the config file.
 *
 *   node scripts/configure-claude-desktop.mjs            # add / update the "weather" entry
 *   node scripts/configure-claude-desktop.mjs --dry-run  # show what would change, write nothing
 *   node scripts/configure-claude-desktop.mjs --remove   # remove the "weather" entry
 *
 * What it does, safely:
 *   - Finds claude_desktop_config.json (Windows normal + Microsoft Store/MSIX locations, macOS, Linux).
 *   - Makes a timestamped backup of every existing config before touching it.
 *   - Parses the existing JSON and changes ONLY mcpServers.weather; every other server
 *     and setting is preserved exactly.
 *   - Refuses to write if the existing file is not valid JSON.
 *   - Uses the absolute path of the node.exe running this script, so Claude Desktop
 *     does not depend on PATH.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_KEY = "weather";
const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const remove = args.has("--remove");

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entryPoint = join(projectRoot, "dist", "index.js");

function candidateDirs() {
  const home = homedir();
  switch (platform()) {
    case "win32": {
      const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
      const localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
      const dirs = [join(appData, "Claude")];
      // Microsoft Store (MSIX) installs can virtualise %APPDATA% into the package's LocalCache.
      const packages = join(localAppData, "Packages");
      if (existsSync(packages)) {
        for (const name of readdirSync(packages)) {
          if (/^Claude_/i.test(name)) dirs.push(join(packages, name, "LocalCache", "Roaming", "Claude"));
        }
      }
      return dirs;
    }
    case "darwin":
      return [join(home, "Library", "Application Support", "Claude")];
    default:
      return [join(process.env.XDG_CONFIG_HOME || join(home, ".config"), "Claude")];
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function main() {
  const [major] = process.versions.node.split(".").map(Number);
  if (major < 20) {
    console.error(`Node ${process.versions.node} is too old. Install Node.js 20 or newer from https://nodejs.org and re-run.`);
    process.exit(1);
  }
  if (!remove && !existsSync(entryPoint)) {
    console.error(`Server entry point not found: ${entryPoint}\nRun "npm run build" first.`);
    process.exit(1);
  }

  const dirs = candidateDirs();
  const existing = dirs.map((d) => join(d, "claude_desktop_config.json")).filter((f) => existsSync(f));

  // Update every config that exists. If none exists, create one in each Claude data dir that exists
  // (falling back to the primary location), which covers both normal and MSIX installs.
  let targets = existing;
  if (targets.length === 0) {
    const present = dirs.filter((d) => existsSync(d));
    targets = (present.length ? present : [dirs[0]]).map((d) => join(d, "claude_desktop_config.json"));
  }

  const serverConfig = { command: process.execPath, args: [entryPoint] };
  let failures = 0;

  for (const file of targets) {
    console.log(`\nConfig: ${file}`);
    let config = {};
    if (existsSync(file)) {
      const raw = readFileSync(file, "utf8").replace(/^﻿/, "");
      if (raw.trim() !== "") {
        try {
          config = JSON.parse(raw);
        } catch (err) {
          console.error(`  ✗ Existing file is not valid JSON (${err.message}). Not modifying it — fix it first.`);
          failures += 1;
          continue;
        }
      }
      if (typeof config !== "object" || config === null || Array.isArray(config)) {
        console.error("  ✗ Existing config is not a JSON object. Not modifying it.");
        failures += 1;
        continue;
      }
    } else {
      console.log("  (file does not exist yet — it will be created)");
    }

    const before = JSON.stringify(config);
    const servers = typeof config.mcpServers === "object" && config.mcpServers !== null ? config.mcpServers : {};
    const others = Object.keys(servers).filter((k) => k !== SERVER_KEY);

    if (remove) {
      if (!(SERVER_KEY in servers)) {
        console.log(`  "${SERVER_KEY}" is not configured here; nothing to do.`);
        continue;
      }
      delete servers[SERVER_KEY];
    } else {
      servers[SERVER_KEY] = serverConfig;
    }
    config.mcpServers = servers;

    if (JSON.stringify(config) === before) {
      console.log("  Already up to date; nothing to change.");
      continue;
    }

    console.log(`  Other MCP servers preserved: ${others.length ? others.join(", ") : "(none)"}`);
    console.log(`  ${remove ? "Removing" : "Setting"} mcpServers.${SERVER_KEY}${remove ? "" : ` = ${JSON.stringify(serverConfig)}`}`);

    if (dryRun) {
      console.log("  --dry-run: nothing written.");
      continue;
    }

    mkdirSync(dirname(file), { recursive: true });
    if (existsSync(file)) {
      const backup = `${file}.backup-${timestamp()}`;
      copyFileSync(file, backup);
      console.log(`  Backup written: ${backup}`);
    }
    const out = `${JSON.stringify(config, null, 2)}\n`;
    JSON.parse(out); // sanity check before writing
    writeFileSync(file, out, "utf8");
    console.log("  ✓ Saved.");
  }

  if (failures > 0) process.exit(1);
  if (!dryRun) {
    console.log("\nNext: fully quit Claude Desktop (system tray icon → Quit, not just closing the window) and reopen it.");
  }
}

main();
