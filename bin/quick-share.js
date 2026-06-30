#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const VERSION = "1.0.0";
const CONFIG_NAME = ".quick-share.json";
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] || "help";
const args = process.argv.slice(3);

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(`quick-share: ${error.message}`);
    process.exit(1);
  });

async function main() {
  if (command === "help" || command === "-h" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "version" || command === "--version") {
    console.log(VERSION);
    return;
  }

  if (command === "init") {
    initProject(args);
    return;
  }

  if (command === "setup-service") {
    setupService(args);
    return;
  }

  if (command === "where") {
    const config = loadConfig();
    printJson({
      configPath: config.configPath,
      apiUrl: config.apiUrl,
      defaultPrefix: config.defaultPrefix || "",
    });
    return;
  }

  if (command === "health") {
    const config = loadConfig();
    printJson(await fetchJson(config, "/health"));
    return;
  }

  if (command === "manifest") {
    const config = loadConfig();
    printJson(await fetchJson(config, "/.well-known/quick-share.json"));
    return;
  }

  if (command === "files") {
    const config = loadConfig();
    const options = parseListOptions(args, config);
    const data = await listFiles(config, options);
    if (options.json) {
      printJson(data);
    } else {
      printFileTable(data.files);
      if (data.next) {
        console.error(`More files available: ${data.next}`);
      }
    }
    return;
  }

  if (command === "urls" || command === "images") {
    const config = loadConfig();
    const options = parseListOptions(args, config);
    const data = await listFiles(config, options);
    const urls = data.files
      .filter((file) => file.url)
      .filter((file) =>
        command === "images" ? file.mimeType?.startsWith("image/") : true,
      )
      .map((file) => file.url);
    console.log(urls.join("\n"));
    return;
  }

  if (command === "open" || command === "copy") {
    const config = loadConfig();
    const selector = args[0];
    if (!selector) throw new Error(`Usage: quick-share ${command} <filename-or-index>`);
    const data = await listFiles(config, parseListOptions(args.slice(1), config));
    const file = selectFile(data.files, selector);
    if (!file?.url) throw new Error(`No public URL found for ${selector}`);
    if (command === "open") openUrl(file.url);
    if (command === "copy") copyText(file.url);
    console.log(file.url);
    return;
  }

  throw new Error(`Unknown command: ${command}. Run quick-share help.`);
}

function printHelp() {
  console.log(`quick-share ${VERSION}

Usage:
  quick-share init <api-url> [prefix] [--project <dir>]
  quick-share setup-service [--name quick-share-api] [--bucket quick-share-assets] [--public-url <url>] [--cors-origin <url>] [--no-deploy]
  quick-share health
  quick-share manifest
  quick-share files [prefix] [--limit 100] [--json]
  quick-share urls [prefix]
  quick-share images [prefix]
  quick-share open <filename-or-index> [prefix]
  quick-share copy <filename-or-index> [prefix]
  quick-share where

Setup:
  quick-share setup-service --bucket quick-share-assets --public-url https://pub-example.r2.dev
  quick-share init https://quick-share-api.example.workers.dev hermes/

How it works:
  The CLI looks for ${CONFIG_NAME} in the current directory or a parent.
  QUICK_SHARE_API_URL can be used instead when no config file exists.
`);
}

function setupService(argv) {
  const options = parseSetupServiceOptions(argv);
  const wrangler = ensureWrangler(options);

  writeWranglerToml(options);
  console.log(`Wrote ${path.join(REPO_ROOT, "wrangler.toml")}`);

  const whoami = runCommand(wrangler.command, [...wrangler.args, "whoami"], {
    allowFailure: true,
    cwd: REPO_ROOT,
  });
  if (whoami.status !== 0) {
    console.log("");
    console.log("Cloudflare authentication is not ready.");
    console.log("Use one of these, then rerun quick-share setup-service:");
    console.log("  wrangler login");
    console.log("  export CLOUDFLARE_API_TOKEN=your_token_here");
    console.log("");
    console.log("The token needs permission to deploy Workers and manage the R2 bucket.");
    return;
  }

  console.log("Cloudflare authentication OK.");

  if (!options.skipBucketCreate) {
    const bucketCreate = runCommand(
      wrangler.command,
      [...wrangler.args, "r2", "bucket", "create", options.bucket],
      {
        allowFailure: true,
        cwd: REPO_ROOT,
      },
    );
    if (bucketCreate.status === 0) {
      console.log(`R2 bucket ready: ${options.bucket}`);
    } else if (bucketCreate.output.toLowerCase().includes("already")) {
      console.log(`R2 bucket already exists: ${options.bucket}`);
    } else {
      throw new Error(`Unable to create R2 bucket: ${bucketCreate.output.trim()}`);
    }
  }

  if (!options.publicUrl) {
    console.log("");
    console.log("No --public-url was provided.");
    console.log("The Worker can list files, but returned file objects will not include public URLs.");
    console.log("Cloudflare documents the R2 public development URL as a dashboard setting:");
    console.log("  R2 bucket > Settings > Public Development URL > Enable");
    console.log("Then rerun with:");
    console.log(`  quick-share setup-service --bucket ${options.bucket} --public-url https://YOUR-PUBLIC-BUCKET.r2.dev`);
  }

  if (options.noDeploy) {
    console.log("Skipped deploy because --no-deploy was provided.");
    return;
  }

  const deploy = runCommand(wrangler.command, [...wrangler.args, "deploy"], {
    allowFailure: false,
    cwd: REPO_ROOT,
  });
  const workerUrl = findWorkerUrl(deploy.output, options.name);

  console.log("");
  console.log("Quick Share service deployed.");
  if (workerUrl) {
    console.log(`  Worker: ${workerUrl}`);
    console.log("");
    console.log("Configure a project with:");
    console.log(`  quick-share init ${workerUrl} shared/ --project /path/to/project`);
  } else {
    console.log("Wrangler deploy completed, but no Worker URL was detected in output.");
    console.log(`Use the deployed Worker URL with: quick-share init <worker-url> shared/`);
  }
}

function parseSetupServiceOptions(argv) {
  const options = {
    name: "quick-share-api",
    bucket: "quick-share-assets",
    publicUrl: "",
    corsOrigin: "*",
    noDeploy: false,
    skipBucketCreate: false,
    noInstall: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--name") {
      options.name = requireOptionValue(argv, index, value);
      index += 1;
    } else if (value === "--bucket") {
      options.bucket = requireOptionValue(argv, index, value);
      index += 1;
    } else if (value === "--public-url") {
      options.publicUrl = trimSlash(requireOptionValue(argv, index, value));
      index += 1;
    } else if (value === "--cors-origin") {
      options.corsOrigin = requireOptionValue(argv, index, value);
      index += 1;
    } else if (value === "--no-deploy") {
      options.noDeploy = true;
    } else if (value === "--skip-bucket-create") {
      options.skipBucketCreate = true;
    } else if (value === "--no-install") {
      options.noInstall = true;
    } else {
      throw new Error(`Unknown setup-service option: ${value}`);
    }
  }

  return options;
}

function requireOptionValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function ensureWrangler(options) {
  const localWrangler = path.join(
    REPO_ROOT,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "wrangler.cmd" : "wrangler",
  );
  if (fs.existsSync(localWrangler)) {
    return { command: localWrangler, args: [] };
  }

  const globalCheck = spawnSync("wrangler", ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (globalCheck.status === 0) {
    return { command: "wrangler", args: [] };
  }

  if (options.noInstall) {
    throw new Error("Wrangler is not installed. Install it or rerun without --no-install.");
  }

  console.log("Wrangler not found. Installing local dev dependency...");
  runCommand("npm", ["install", "--save-dev", "wrangler"], {
    allowFailure: false,
    cwd: REPO_ROOT,
  });

  if (!fs.existsSync(localWrangler)) {
    throw new Error("Wrangler install completed but local binary was not found.");
  }
  return { command: localWrangler, args: [] };
}

function writeWranglerToml(options) {
  const toml = `name = "${options.name}"
main = "assets/library/worker.js"
compatibility_date = "2026-06-30"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "${options.bucket}"

[vars]
SERVICE_NAME = "quick-share"
PUBLIC_BASE_URL = "${options.publicUrl}"
CORS_ORIGIN = "${options.corsOrigin}"
`;

  fs.writeFileSync(path.join(REPO_ROOT, "wrangler.toml"), toml);
}

function runCommand(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (result.error && !options.allowFailure) {
    throw result.error;
  }
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed:\n${output}`);
  }
  return {
    status: result.status ?? 1,
    output,
  };
}

function findWorkerUrl(output, name) {
  const urls = output.match(/https:\/\/[^\s]+\.workers\.dev/g) || [];
  return urls.find((url) => url.includes(name)) || urls[0] || "";
}

function initProject(argv) {
  const apiUrl = trimSlash(argv.find((arg) => !arg.startsWith("--")) || "");
  if (!apiUrl) {
    throw new Error("Usage: quick-share init <api-url> [prefix] [--project <dir>]");
  }

  const nonFlags = argv.filter((arg) => !arg.startsWith("--"));
  const prefix = nonFlags[1] || "";
  const projectFlagIndex = argv.indexOf("--project");
  const projectDir =
    projectFlagIndex >= 0 && argv[projectFlagIndex + 1]
      ? path.resolve(argv[projectFlagIndex + 1])
      : process.cwd();

  if (!fs.existsSync(projectDir)) {
    throw new Error(`Project directory does not exist: ${projectDir}`);
  }

  const configPath = path.join(projectDir, CONFIG_NAME);
  const config = {
    schemaVersion: "1.0",
    apiUrl,
    defaultPrefix: prefix,
    manifestUrl: `${apiUrl}/.well-known/quick-share.json`,
    healthUrl: `${apiUrl}/health`,
    filesUrl: `${apiUrl}/files`,
  };

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  upsertAgentNote(projectDir, apiUrl, prefix);

  console.log("Quick Share configured");
  console.log(`  Config: ${configPath}`);
  console.log(`  API:    ${apiUrl}`);
  console.log(`  Prefix: ${prefix || "none"}`);
}

function upsertAgentNote(projectDir, apiUrl, prefix) {
  const agentsPath = path.join(projectDir, "AGENTS.md");
  const note = `
## Quick Share

Use Quick Share for shared public assets in this project.

- Config: \`${CONFIG_NAME}\`
- Base API: \`${apiUrl}\`
- Default prefix: \`${prefix || "none"}\`
- CLI: \`quick-share files\`, \`quick-share urls\`, \`quick-share images\`
`;

  if (!fs.existsSync(agentsPath)) {
    fs.writeFileSync(agentsPath, `# Project Agent Notes\n${note}`);
    return;
  }

  const existing = fs.readFileSync(agentsPath, "utf8");
  if (existing.includes("## Quick Share")) return;
  fs.writeFileSync(agentsPath, `${existing.replace(/\s*$/, "")}\n${note}`);
}

function parseListOptions(argv, config) {
  const options = {
    prefix: config.defaultPrefix || "",
    limit: 1000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--limit") {
      options.limit = Number.parseInt(argv[index + 1] || "", 10);
      index += 1;
    } else if (value === "--json") {
      options.json = true;
    } else if (!value.startsWith("--")) {
      options.prefix = value;
    }
  }

  if (!Number.isFinite(options.limit) || options.limit < 1 || options.limit > 1000) {
    throw new Error("--limit must be a number from 1 to 1000");
  }

  return options;
}

async function listFiles(config, options) {
  const search = new URLSearchParams();
  search.set("limit", String(options.limit || 1000));
  if (options.prefix) search.set("prefix", options.prefix);
  return fetchJson(config, `/files?${search}`);
}

async function fetchJson(config, route) {
  const response = await fetch(`${config.apiUrl}${route}`);
  const text = await response.text();
  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${route}, got: ${text.slice(0, 120)}`);
  }

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status} from ${route}`);
  }

  return data;
}

function loadConfig() {
  const configPath = findConfigPath(process.cwd());
  const fileConfig = configPath
    ? JSON.parse(fs.readFileSync(configPath, "utf8"))
    : {};
  const apiUrl = trimSlash(process.env.QUICK_SHARE_API_URL || fileConfig.apiUrl || "");

  if (!apiUrl) {
    throw new Error(
      `No Quick Share config found. Run: quick-share init <api-url> [prefix]`,
    );
  }

  return {
    ...fileConfig,
    configPath: configPath || null,
    apiUrl,
    defaultPrefix: process.env.QUICK_SHARE_PREFIX || fileConfig.defaultPrefix || "",
  };
}

function findConfigPath(startDir) {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, CONFIG_NAME);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function selectFile(files, selector) {
  const index = Number.parseInt(selector, 10);
  if (Number.isInteger(index) && String(index) === selector) {
    return files[index - 1];
  }

  const exact = files.find((file) => file.name === selector);
  if (exact) return exact;
  return files.find((file) => file.name.includes(selector));
}

function printFileTable(files) {
  if (!files.length) {
    console.log("No files found.");
    return;
  }

  const rows = files.map((file, index) => ({
    index: String(index + 1),
    name: file.name,
    size: formatSize(file.size),
    type: file.mimeType || "-",
    url: file.url || "-",
  }));

  const widths = {
    index: Math.max(1, ...rows.map((row) => row.index.length)),
    name: Math.min(52, Math.max(4, ...rows.map((row) => row.name.length))),
    size: Math.max(4, ...rows.map((row) => row.size.length)),
    type: Math.min(28, Math.max(4, ...rows.map((row) => row.type.length))),
  };

  console.log(
    `${pad("#", widths.index)}  ${pad("Name", widths.name)}  ${pad("Size", widths.size)}  ${pad("Type", widths.type)}  URL`,
  );
  for (const row of rows) {
    console.log(
      `${pad(row.index, widths.index)}  ${pad(truncate(row.name, widths.name), widths.name)}  ${pad(row.size, widths.size)}  ${pad(truncate(row.type, widths.type), widths.type)}  ${row.url}`,
    );
  }
}

function pad(value, width) {
  return String(value).padEnd(width, " ");
}

function truncate(value, width) {
  if (value.length <= width) return value;
  return `${value.slice(0, Math.max(0, width - 3))}...`;
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)}${units[index]}`;
}

function openUrl(url) {
  const commandByPlatform = {
    darwin: "open",
    linux: "xdg-open",
    win32: "cmd",
  };
  const command = commandByPlatform[process.platform];
  if (!command) throw new Error(`Cannot open URLs on ${process.platform}`);
  const args = process.platform === "win32" ? ["/c", "start", url] : [url];
  spawnSync(command, args, { stdio: "ignore" });
}

function copyText(text) {
  const copyCommand =
    process.platform === "darwin"
      ? ["pbcopy", []]
      : process.platform === "win32"
        ? ["clip", []]
        : ["xclip", ["-selection", "clipboard"]];
  const result = spawnSync(copyCommand[0], copyCommand[1], {
    input: text,
    stdio: ["pipe", "ignore", "ignore"],
  });
  if (result.error) {
    const fallback = path.join(os.tmpdir(), "quick-share-url.txt");
    fs.writeFileSync(fallback, text);
    console.error(`Clipboard unavailable. URL written to ${fallback}`);
  }
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function trimSlash(value) {
  return value.replace(/\/+$/, "");
}
