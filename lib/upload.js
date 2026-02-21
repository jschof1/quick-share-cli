const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const readline = require("readline");

const CONFIG_DIR = path.join(os.homedir(), ".quick-share");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

function loadConfig() {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
}

function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
}

function validateConfig() {
  const config = loadConfig();
  if (!config) {
    throw new Error("Configuration not found. Run: quick-share setup");
  }

  const required = [
    "accountId",
    "accessKeyId",
    "secretAccessKey",
    "bucketName",
    "publicUrl",
  ];
  for (const field of required) {
    if (!config[field]) {
      throw new Error(
        `Missing configuration: ${field}. Run: quick-share setup`,
      );
    }
  }

  return config;
}

async function setupConfig() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt) =>
    new Promise((resolve) => {
      rl.question(prompt, resolve);
    });

  console.log("This will configure your Cloudflare R2 credentials.\n");
  console.log(
    "Get your credentials from: https://dash.cloudflare.com/ → R2 → Manage R2 API Tokens\n",
  );

  const accountId = await question("R2 Account ID: ");
  const accessKeyId = await question("R2 Access Key ID: ");
  const secretAccessKey = await question("R2 Secret Access Key (hidden): ");
  const bucketName = await question("Bucket Name: ");
  const publicUrl = await question(
    "Public URL (e.g., https://pub-xxxxx.r2.dev): ",
  );

  rl.close();

  const config = {
    accountId: accountId.trim(),
    accessKeyId: accessKeyId.trim(),
    secretAccessKey: secretAccessKey.trim(),
    bucketName: bucketName.trim(),
    publicUrl: publicUrl.trim().replace(/\/$/, ""), // Remove trailing slash
    endpoint: `https://${accountId.trim()}.r2.cloudflarestorage.com`,
  };

  saveConfig(config);
}

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".zip": "application/zip",
    ".tar": "application/x-tar",
    ".gz": "application/gzip",
    ".txt": "text/plain",
    ".json": "application/json",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

function formatFileSize(bytes) {
  const sizes = ["Bytes", "KB", "MB", "GB"];
  if (bytes === 0) return "0 Bytes";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
}

async function uploadFile(filePath, options = {}) {
  const config = validateConfig();

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stats = fs.statSync(filePath);
  const basename = path.basename(filePath);
  const mimeType = getMimeType(filePath);

  // Check if rclone is installed
  try {
    execSync("which rclone", { stdio: "ignore" });
  } catch (e) {
    throw new Error("rclone not found. Install with: brew install rclone");
  }

  // Build rclone command
  const cmd = [
    "rclone",
    "copy",
    `"${filePath}"`,
    `":s3:${config.bucketName}"`,
    "--s3-provider=Cloudflare",
    `--s3-endpoint="${config.endpoint}"`,
    `--s3-access-key-id="${config.accessKeyId}"`,
    `--s3-secret-access-key="${config.secretAccessKey}"`,
    "--s3-acl=public-read",
    "--s3-region=auto",
    "--s3-no-check-bucket",
    "--quiet",
  ].join(" ");

  execSync(cmd, { stdio: "pipe" });

  const publicUrl = `${config.publicUrl}/${basename}`;

  return {
    url: publicUrl,
    size: formatFileSize(stats.size),
    mimeType: mimeType,
    isImage: mimeType.startsWith("image/"),
    isVideo: mimeType.startsWith("video/"),
    isAudio: mimeType.startsWith("audio/"),
  };
}

module.exports = {
  loadConfig,
  saveConfig,
  validateConfig,
  setupConfig,
  uploadFile,
  getMimeType,
  formatFileSize,
};
