import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  objectKey,
  configFromPreferences,
  publicUrl,
  uploadFile,
} from "../src/uploader";
const config = {
  bucketName: "test-bucket",
  endpoint: "https://example.r2.cloudflarestorage.com",
  accessKeyId: "test-key",
  secretAccessKey: "test-secret",
  publicUrl: "https://example.com/",
};
test("requires each user's own configuration with no shared defaults", () => {
  assert.equal(configFromPreferences(config).BUCKET_NAME, "test-bucket");
  assert.throws(() => configFromPreferences({}), /Missing/);
  for (const key of Object.keys(config)) {
    assert.throws(
      () => configFromPreferences({ ...config, [key]: "" }),
      /Missing/,
    );
  }
  assert.throws(
    () => configFromPreferences({ ...config, publicUrl: "http://example.com" }),
    /HTTPS/,
  );
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
    const file = join(dir, "file $(touch unwanted) & #.txt");
    const rclonePath = join(dir, "rclone");
    const capture = join(dir, "capture.json");
    await writeFile(file, "test");
    await writeFile(
      rclonePath,
      `#!/usr/bin/env node\nrequire('fs').writeFileSync(${JSON.stringify(capture)},JSON.stringify({args:process.argv.slice(2),hasCredentials:process.env.RCLONE_S3_SECRET_ACCESS_KEY==='test-secret'}));`,
      { mode: 0o755 },
    );
    const result = await uploadFile(file, { ...config, rclonePath });
    const recorded = JSON.parse(await readFile(capture, "utf8"));
    assert.equal(recorded.args[1], file);
    assert.ok(recorded.args[2].startsWith(":s3:test-bucket/raycast/"));
    assert.ok(
      recorded.args.includes(
        "--s3-endpoint=https://example.r2.cloudflarestorage.com",
      ),
    );
    assert.equal(recorded.hasCredentials, true);
    assert.equal(recorded.args.join(" ").includes("test-secret"), false);
    assert.equal(result.size, 4);
    assert.ok(result.url.includes("%23.txt"));
    await writeFile(rclonePath, "#!/bin/sh\necho test-secret >&2\nexit 1\n", {
      mode: 0o755,
    });
    await assert.rejects(
      uploadFile(file, { ...config, rclonePath }),
      (error: Error) =>
        error.message.includes("Upload failed") &&
        !error.message.includes("test-secret"),
    );
    await assert.rejects(
      uploadFile(dir, { ...config, rclonePath }),
      /regular file/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
