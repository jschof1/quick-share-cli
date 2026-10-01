import { access, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
export interface Upload {
  id: string;
  name: string;
  url: string;
  size: number;
  uploadedAt: string;
}
export interface Config {
  BUCKET_NAME: string;
  R2_ENDPOINT: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_PUBLIC_URL: string;
}
export function parseConfig(text: string): Config {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const match = line.match(
      /^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/,
    );
    if (!match)
      throw new Error(
        "Configuration must contain plain KEY=value assignments.",
      );
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    )
      value = value.slice(1, -1);
    if (/[$`]/.test(value))
      throw new Error(
        "Configuration must use literal values, without shell expressions.",
      );
    values[match[1]] = value;
  }
  for (const key of [
    "BUCKET_NAME",
    "R2_ENDPOINT",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_PUBLIC_URL",
  ]) {
    if (!values[key]) throw new Error(`Missing ${key} in R2 configuration.`);
  }
  for (const key of ["R2_ENDPOINT", "R2_PUBLIC_URL"]) {
    const url = new URL(values[key]);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error(
        `${key} must be an HTTPS URL without credentials, query, or fragment.`,
      );
  }
  if (!/^[a-z0-9][a-z0-9.-]*$/.test(values.BUCKET_NAME))
    throw new Error("Invalid bucket name.");
  return values as unknown as Config;
}
export function objectKey(file: string, id: string = randomUUID()): string {
  return `raycast/${id}/${basename(file)}`;
}
export function publicUrl(base: string, key: string): string {
  return `${base.replace(/\/+$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
export async function loadConfig(configPath = ""): Promise<Config> {
  const file = configPath.trim() || join(homedir(), ".r2-config");
  try {
    return parseConfig(
      await readFile(
        file.startsWith("~/") ? join(homedir(), file.slice(2)) : file,
        "utf8",
      ),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error(
        "R2 config not found. Run setup-r2.sh or set its path in extension preferences.",
      );
    throw error;
  }
}
async function findRclone(custom = ""): Promise<string> {
  const candidates = custom
    ? [custom]
    : [
        "/opt/homebrew/bin/rclone",
        "/usr/local/bin/rclone",
        ...String(process.env.PATH || "")
          .split(":")
          .filter(Boolean)
          .map((dir) => join(dir, "rclone")),
      ];
  for (const file of candidates) {
    try {
      await access(file, constants.X_OK);
      return file;
    } catch {
      /* Try next installation. */
    }
  }
  throw new Error(
    "rclone not found. Install with brew install rclone, or set its path in preferences.",
  );
}
export async function uploadFile(
  file: string,
  preferences: { configPath?: string; rclonePath?: string } = {},
): Promise<Upload> {
  const info = await stat(file);
  if (!info.isFile()) throw new Error("Choose a regular file, not a folder.");
  const config = await loadConfig(preferences.configPath);
  const rclone = await findRclone(preferences.rclonePath);
  const id: string = randomUUID();
  const key = objectKey(file, id);
  try {
    await exec(
      rclone,
      [
        "copyto",
        file,
        `:s3:${config.BUCKET_NAME}/${key}`,
        "--s3-provider=Cloudflare",
        `--s3-endpoint=${config.R2_ENDPOINT}`,
        "--s3-region=auto",
        "--s3-no-check-bucket",
        "--quiet",
      ],
      {
        env: {
          ...process.env,
          RCLONE_S3_ACCESS_KEY_ID: config.R2_ACCESS_KEY_ID,
          RCLONE_S3_SECRET_ACCESS_KEY: config.R2_SECRET_ACCESS_KEY,
        },
        timeout: 30 * 60 * 1000,
        maxBuffer: 1024 * 1024,
      },
    );
  } catch {
    // Do not expose process diagnostics or credential material in UI or telemetry.
    throw new Error(
      "Upload failed. Check your connection, R2 credentials, bucket permissions, and rclone path, then retry.",
    );
  }
  return {
    id,
    name: basename(file),
    url: publicUrl(config.R2_PUBLIC_URL, key),
    size: info.size,
    uploadedAt: new Date().toISOString(),
  };
}
