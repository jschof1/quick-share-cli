import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { objectKey, parseConfig, publicUrl, uploadFile } from "../src/uploader";
const config =
  'BUCKET_NAME="test-bucket"\nR2_ENDPOINT="https://example.r2.cloudflarestorage.com"\nR2_ACCESS_KEY_ID="test-key"\nR2_SECRET_ACCESS_KEY="test-secret"\nR2_PUBLIC_URL="https://example.com/"';
test("parses setup-r2 config without executing shell expressions", () => {
  assert.equal(parseConfig(config).BUCKET_NAME, "test-bucket");
  assert.throws(
    () => parseConfig(config.replace("test-secret", "$(echo unsafe)")),
    /literal/,
  );
  assert.throws(
    () =>
      parseConfig(
        config.replace("https://example.com/", "http://example.com/"),
      ),
    /HTTPS/,
  );
  assert.throws(() => parseConfig("BUCKET_NAME=test"), /Missing/);
});
test("unique upload keys and encoded public links", () => {
  assert.notEqual(objectKey("/tmp/file.txt"), objectKey("/tmp/file.txt"));
  assert.equal(
    publicUrl("https://example.com/", objectKey("/tmp/a & #.txt", "id")),
    "https://example.com/raycast/id/a%20%26%20%23.txt",
  );
});
test("passes paths as arguments and credentials only via environment; sanitizes failures", async () => {
  const dir = await mkdtemp(join(tmpdir(), "raycast-upload-"));
  try {
    const configPath = join(dir, "config");
    const file = join(dir, "file $(touch unwanted) & #.txt");
    const rclonePath = join(dir, "rclone");
    const capture = join(dir, "capture.json");
    await writeFile(configPath, config);
    await writeFile(file, "test");
    await writeFile(
      rclonePath,
      `#!/usr/bin/env node\nrequire('fs').writeFileSync(${JSON.stringify(capture)},JSON.stringify({args:process.argv.slice(2),hasCredentials:process.env.RCLONE_S3_SECRET_ACCESS_KEY==='test-secret'}));`,
      { mode: 0o755 },
    );
    const result = await uploadFile(file, { configPath, rclonePath });
    const recorded = JSON.parse(await readFile(capture, "utf8"));
    assert.equal(recorded.args[1], file);
    assert.equal(recorded.hasCredentials, true);
    assert.equal(recorded.args.join(" ").includes("test-secret"), false);
    assert.equal(result.size, 4);
    assert.ok(result.url.includes("%23.txt"));
    await writeFile(rclonePath, "#!/bin/sh\necho test-secret >&2\nexit 1\n", {
      mode: 0o755,
    });
    await assert.rejects(
      uploadFile(file, { configPath, rclonePath }),
      (error: Error) =>
        error.message.includes("Upload failed") &&
        !error.message.includes("test-secret"),
    );
    await assert.rejects(
      uploadFile(dir, { configPath, rclonePath }),
      /regular file/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
