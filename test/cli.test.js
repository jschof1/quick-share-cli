import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../assets/library/worker.js';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../bin/quick-share.js', import.meta.url));
const objects = [
  { key: 'client/photo a.jpg', size: 20, uploaded: new Date('2026-10-01') },
  { key: 'client/guide.pdf', size: 10, uploaded: new Date('2026-10-01') },
];
let server, apiUrl, dir;
const requests = [];
let unavailable = false;
before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'quick-share-cli-'));
  server = createServer(async (request, response) => {
    requests.push({ method: request.method, url: request.url });
    if (unavailable) {
      response.writeHead(503, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Fixture unavailable' }));
      return;
    }
    const result = await worker.fetch(new Request(apiUrl + request.url, { method: request.method }), {
      PUBLIC_BASE_URL: 'https://assets.example.invalid',
      R2_BUCKET: {
        async list({ prefix = '', limit }) {
          return { objects: objects.filter(x => x.key.startsWith(prefix)).slice(0, limit), truncated: false };
        },
      },
    });
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(await result.text());
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  apiUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
});
function run(args, overrides = {}) {
  return exec(process.execPath, [cli, ...args], {
    cwd: dir,
    env: { ...process.env, QUICK_SHARE_API_URL: apiUrl, QUICK_SHARE_PREFIX: 'client/', ...overrides },
  });
}
test('help and version need no configured provider', async () => {
  assert.match((await run(['help'], { QUICK_SHARE_API_URL: '' })).stdout, /quick-share/i);
  assert.equal((await run(['version'], { QUICK_SHARE_API_URL: '' })).stdout.trim(), '1.0.0');
});
test('health reads the real Worker contract without storage writes', async () => {
  const result = JSON.parse((await run(['health'])).stdout);
  assert.equal(result.ok, true);
  assert.equal(result.bucketBound, true);
  assert.equal(requests.at(-1).method, 'GET');
});
test('file listing keeps project scope and requested limit', async () => {
  const result = JSON.parse((await run(['files', '--limit', '1', '--json'])).stdout);
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].name, 'client/photo a.jpg');
  const query = new URL(requests.at(-1).url, apiUrl).searchParams;
  assert.equal(query.get('prefix'), 'client/');
  assert.equal(query.get('limit'), '1');
});
test('image discovery filters documents and preserves public URL encoding', async () => {
  const result = (await run(['images'])).stdout;
  assert.match(result, /photo%20a\.jpg/);
  assert.ok(!result.includes('guide.pdf'));
});
test('invalid limits fail before a network request', async () => {
  const count = requests.length;
  await assert.rejects(run(['files', '--limit', '0']), error => /1 to 1000/.test(error.stderr));
  assert.equal(requests.length, count);
});
test('upstream failure is an error, never a successful empty result', async () => {
  unavailable = true;
  try {
    await assert.rejects(run(['health']), error => /Fixture unavailable/.test(error.stderr));
  } finally { unavailable = false; }
  assert.ok(requests.every(x => x.method === 'GET'));
});
