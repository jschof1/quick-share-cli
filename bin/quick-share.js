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
