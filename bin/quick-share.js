#!/usr/bin/env node

const { program } = require("commander");
const chalk = require("chalk");
const ora = require("ora");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const packageJson = require("../package.json");
const { uploadFile, setupConfig, validateConfig } = require("../lib/upload");

program
  .name("quick-share")
  .description("⚡ Lightning-fast file sharing via Cloudflare R2")
  .version(packageJson.version);

program
  .command("upload <file>")
  .alias("up")
  .description("Upload a file to Cloudflare R2")
  .option("-c, --config <path>", "Path to custom config file")
  .action(async (file, options) => {
    try {
      const spinner = ora("Uploading file...").start();
      const result = await uploadFile(file, options);
      spinner.succeed("Upload complete!");

      console.log(chalk.green("\n✓ File uploaded successfully!\n"));
      console.log(chalk.blue("URL:      ") + chalk.white(result.url));
      console.log(chalk.blue("Size:     ") + chalk.white(result.size));
      console.log(chalk.blue("Type:     ") + chalk.white(result.mimeType));

      if (result.isImage) {
        console.log(chalk.yellow("\nMarkdown: ") + `![file](${result.url})`);
        console.log(
          chalk.yellow("HTML:     ") + `<img src="${result.url}" alt="file">`,
        );
      } else if (result.isVideo) {
        console.log(
          chalk.yellow("\nVideo:    ") +
            `<video controls><source src="${result.url}" type="${result.mimeType}"></video>`,
        );
      } else if (result.isAudio) {
        console.log(
          chalk.yellow("\nAudio:    ") +
            `<audio controls><source src="${result.url}" type="${result.mimeType}"></audio>`,
        );
      }

      // Copy to clipboard
      try {
        if (process.platform === "darwin") {
          execSync(`echo "${result.url}" | pbcopy`);
          console.log(chalk.green("\n✓ URL copied to clipboard"));
        } else if (process.platform === "linux") {
          execSync(`echo "${result.url}" | xclip -selection clipboard`);
          console.log(chalk.green("\n✓ URL copied to clipboard"));
        }
      } catch (e) {
        // Clipboard not available, skip
      }
    } catch (error) {
      console.error(chalk.red("\n✗ Upload failed:"), error.message);
      process.exit(1);
    }
  });

program
  .command("setup")
  .description("Configure Cloudflare R2 credentials")
  .action(async () => {
    console.log(chalk.blue("⚡ Quick Share CLI Setup\n"));
    await setupConfig();
    console.log(chalk.green("\n✓ Setup complete! You can now upload files."));
  });

program
  .command("config")
  .description("Show current configuration")
  .action(() => {
    const configPath = path.join(os.homedir(), ".quick-share", "config.json");

    if (!fs.existsSync(configPath)) {
      console.log(
        chalk.yellow("No configuration found. Run: quick-share setup"),
      );
      return;
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    console.log(chalk.blue("Current Configuration:\n"));
    console.log(
      chalk.blue("Account ID:    ") +
        (config.accountId ? "✓ Set" : "✗ Not set"),
    );
    console.log(
      chalk.blue("Bucket:        ") + (config.bucketName || "Not set"),
    );
    console.log(
      chalk.blue("Public URL:    ") + (config.publicUrl || "Not set"),
    );
    console.log(
      chalk.blue("Credentials:   ") +
        (config.accessKeyId ? "✓ Set" : "✗ Not set"),
    );
  });

program
  .command("library")
  .alias("lib")
  .description("Deploy a public file library to Cloudflare Pages")
  .option(
    "-n, --name <name>",
    "Project name for Cloudflare Pages",
    "quick-share-library",
  )
  .option("-d, --domain <domain>", "Custom domain (optional)")
  .action(async (options) => {
    console.log(chalk.blue("⚡ Deploying File Library...\n"));

    // Check for wrangler
    try {
      execSync("which wrangler", { stdio: "ignore" });
    } catch (e) {
      console.log(chalk.yellow("Installing wrangler..."));
      execSync("npm install -g wrangler", { stdio: "inherit" });
    }

    // Check if logged in
    try {
      execSync("wrangler whoami", { stdio: "ignore" });
    } catch (e) {
      console.log(chalk.red("Please run: wrangler login"));
      process.exit(1);
    }

    // Create temp directory
    const tempDir = require("os").tmpdir();
    const libDir = path.join(__dirname, "..", "assets", "library");
    const deployDir = path.join(tempDir, "quick-share-lib-deploy");

    // Copy library files
    execSync(`rm -rf "${deployDir}" && cp -r "${libDir}" "${deployDir}"`);

    // Update config in index.html
    const config = validateConfig();
    const indexPath = path.join(deployDir, "index.html");
    let indexHtml = fs.readFileSync(indexPath, "utf8");
    indexHtml = indexHtml.replace(
      /const PUBLIC_URL = '.*';/,
      `const PUBLIC_URL = '${config.publicUrl}';`,
    );
    fs.writeFileSync(indexPath, indexHtml);

    console.log(chalk.blue("Deploying to Cloudflare Pages..."));

    try {
      execSync(
        `cd "${deployDir}" && wrangler pages project list 2>/dev/null | grep -q "${options.name}" || wrangler pages project create "${options.name}"`,
        { stdio: "pipe" },
      );
    } catch (e) {
      // Project might already exist
    }

    execSync(
      `cd "${deployDir}" && wrangler pages deploy . --project-name="${options.name}"`,
      { stdio: "inherit" },
    );

    console.log(chalk.green("\n✓ Library deployed!"));
    console.log(chalk.blue("\nYour library is live at:"));
    console.log(chalk.white(`  https://${options.name}.pages.dev`));

    if (options.domain) {
      console.log(chalk.blue("\nAdding custom domain..."));
      execSync(
        `wrangler pages domain add "${options.name}" "${options.domain}"`,
        { stdio: "inherit" },
      );
      console.log(chalk.green(`✓ Domain ${options.domain} connected!`));
    }

    // Cleanup
    execSync(`rm -rf "${deployDir}"`);

    console.log(chalk.blue("\nNext steps:"));
    console.log(
      "  1. Deploy a Worker to list R2 files (see: quick-share library --worker)",
    );
    console.log("  2. Update WORKER_URL in your library to use the worker");
  });

program
  .command("worker")
  .description("Deploy a Cloudflare Worker that lists R2 files")
  .option("-n, --name <name>", "Worker name", "quick-share-api")
  .action(async (options) => {
    console.log(chalk.blue("⚡ Deploying API Worker...\n"));

    // Check for wrangler
    try {
      execSync("which wrangler", { stdio: "ignore" });
    } catch (e) {
      console.log(chalk.yellow("Installing wrangler..."));
      execSync("npm install -g wrangler", { stdio: "inherit" });
    }

    const config = validateConfig();
    const workerContent = `addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (url.pathname !== "/files" && url.pathname !== "/files.json") {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const list = await R2_BUCKET.list({ limit: 1000 });
    
    const files = list.objects.map(obj => ({
      name: obj.key,
      size: obj.size,
      uploadedAt: obj.uploaded,
    }));
    
    return new Response(JSON.stringify({ files }, null, 2), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}`;

    // Write wrangler.toml
    const tempDir = require("os").tmpdir();
    const workerDir = path.join(tempDir, "quick-share-worker");
    execSync(`rm -rf "${workerDir}" && mkdir -p "${workerDir}"`);

    const wranglerToml = `
name = "${options.name}"
main = "index.js"
compatibility_date = "2023-12-01"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "${config.bucketName}"
`;

    fs.writeFileSync(path.join(workerDir, "wrangler.toml"), wranglerToml);
    fs.writeFileSync(path.join(workerDir, "index.js"), workerContent);

    console.log(chalk.blue("Deploying worker..."));
    execSync(`cd "${workerDir}" && wrangler deploy`, { stdio: "inherit" });

    console.log(chalk.green("\n✓ Worker deployed!"));
    console.log(chalk.blue("\nWorker URL:"));
    console.log(
      chalk.white(
        `  https://${options.name}.${config.accountId}.workers.dev/files`,
      ),
    );

    // Cleanup
    execSync(`rm -rf "${workerDir}"`);

    console.log(chalk.blue("\nNow update your library:"));
    console.log(chalk.white(`  quick-share library`));
  });

// Default action - if just a file path is provided
program
  .arguments("<file>")
  .description("Quickly upload a file (shortcut)")
  .action(async (file) => {
    if (!fs.existsSync(file)) {
      console.error(chalk.red("Error: File not found -"), file);
      process.exit(1);
    }

    try {
      validateConfig();
    } catch (e) {
      console.log(chalk.yellow("⚠ Configuration required"));
      console.log("Run: quick-share setup\n");
      process.exit(1);
    }

    // Delegate to upload command
    program.parse(["node", "quick-share", "upload", file]);
  });

program.parse();
