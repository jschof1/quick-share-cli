const PUBLIC_URL = 'https://pub-347aa0ad8b93489db6fe959dca5c3b05.r2.dev';
const PRIVATE_PREFIX = '.quickshare/';
const COOKIE = '__Host-jackfiles';
const SESSION_SECONDS = 30 * 86400;
const PART_SIZE = 8 * 1024 * 1024;
const MAX_SIZE = 5 * 1024 ** 3;
const encoder = new TextEncoder();
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra } });
const validName = name => typeof name === 'string' && name.length > 0 && encoder.encode(name).length <= 1024 && !/[\x00-\x1f\x7f]/.test(name) && !name.startsWith(PRIVATE_PREFIX) && name.split('/').every(part => part && part !== '.' && part !== '..');
const publicUrl = name => `${PUBLIC_URL}/${name.split('/').map(encodeURIComponent).join('/')}`;
function contentType(obj) {
  const mime = (obj.httpMetadata?.contentType || '').split(';')[0].trim().toLowerCase();
  if (mime && mime !== 'application/octet-stream') return mime;
  const ext = obj.key.split('.').pop().toLowerCase();
  return ({ mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', gif:'image/gif', webp:'image/webp', avif:'image/avif', svg:'image/svg+xml', mp3:'audio/mpeg', wav:'audio/wav', m4a:'audio/mp4', pdf:'application/pdf' })[ext] || mime || 'application/octet-stream';
}
const toFile = obj => ({ name: obj.key, size: obj.size, uploadedAt: obj.uploaded, mimeType: contentType(obj), url: publicUrl(obj.key) });

async function signingKey(env) {
  return crypto.subtle.importKey('raw', encoder.encode(env.UPLOAD_PASSWORD), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function token(env) {
  const expiry = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(env), encoder.encode(`jackfiles:${expiry}`)));
  return `${expiry}.${Array.from(signature, b => b.toString(16).padStart(2, '0')).join('')}`;
}
async function authenticated(request, env) {
  if (!env.UPLOAD_PASSWORD) return false;
  const value = request.headers.get('Cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) || '';
  const [expiry, hex] = value.split('.');
  const now = Date.now() / 1000;
  if (!/^\d+$/.test(expiry || '') || Number(expiry) <= now || Number(expiry) > now + SESSION_SECONDS + 60 || !/^[a-f0-9]{64}$/.test(hex || '')) return false;
  return crypto.subtle.verify('HMAC', await signingKey(env), Uint8Array.from(hex.match(/../g), h => parseInt(h, 16)), encoder.encode(`jackfiles:${expiry}`));
}
async function bodyJson(request) {
  // Bound JSON bodies even when Content-Length is absent.
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing request body');
  let length = 0; const chunks = [];
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > 1024 * 1024) { await reader.cancel(); throw new Error('Request too large'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
function disposition(name) {
  const filename = name.split('/').pop();
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${filename.replace(/[^a-zA-Z0-9._ -]/g, '_')}"; filename*=UTF-8''${encoded}`;
}

async function handle(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/') && path !== '/download' && path !== '/media') return env.ASSETS.fetch(request);
  if (!env.FILES) return json({ error: 'File storage is unavailable.' }, 503);
  if (!['GET', 'HEAD', 'POST', 'PUT', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
  // Every write requires same-origin browser intent. Cross-origin reads remain public.
  if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('Origin') !== url.origin) return json({ error: 'Origin not allowed' }, 403);

  if (path === '/api/session' && request.method === 'GET') return json({ authenticated: await authenticated(request, env), uploadAvailable: Boolean(env.UPLOAD_PASSWORD), maxFileSize: MAX_SIZE });
  if (path === '/api/login' && request.method === 'POST') {
    if (!env.UPLOAD_PASSWORD) return json({ error: 'Uploads are not configured.' }, 503);
    const { password } = await bodyJson(request);
    if (typeof password !== 'string' || password.length > 256) return json({ error: 'Incorrect passphrase.' }, 401);
    const expected = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(env.UPLOAD_PASSWORD)));
    const actual = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(password)));
    let difference = 0; for (let i = 0; i < expected.length; i++) difference |= expected[i] ^ actual[i];
    if (difference) return json({ error: 'Incorrect passphrase.' }, 401);
    return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=${await token(env)}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict` });
  }
  if (path === '/api/logout' && request.method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict` });

  if (path === '/api/files' && request.method === 'GET') {
    const cursor = url.searchParams.get('cursor') || undefined;
    const list = await env.FILES.list({ limit: 1000, cursor, include: ['httpMetadata'] });
    return json({ files: list.objects.filter(o => !o.key.startsWith(PRIVATE_PREFIX)).map(toFile), cursor: list.truncated ? list.cursor : null });
  }
  if ((path === '/download' || path === '/media') && ['GET', 'HEAD'].includes(request.method)) {
    const name = url.searchParams.get('file');
    if (!validName(name)) return json({ error: 'Invalid filename' }, 400);
    const object = request.method === 'HEAD' ? await env.FILES.head(name) : await env.FILES.get(name, path === '/media' ? { range: request.headers } : undefined);
    if (!object) return json({ error: 'File not found' }, 404);
    const headers = new Headers(); object.writeHttpMetadata(headers);
    headers.set('ETag', object.httpEtag);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'private, max-age=0, must-revalidate');
    headers.set('Content-Type', contentType(object));
    // Only images, audio, video and PDFs may render inline on the app origin.
    const safeInline = /^(image\/(jpeg|png|gif|webp|avif|bmp|x-icon)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|application\/pdf)$/.test(headers.get('Content-Type')) && !object.key.toLowerCase().endsWith('.svg');
    if (path === '/download' || !safeInline) headers.set('Content-Disposition', disposition(name));
    let status = 200;
    if (object.range) {
      const start = object.range.offset || 0;
      headers.set('Content-Range', `bytes ${start}-${start + object.range.length - 1}/${object.size}`);
      headers.set('Content-Length', String(object.range.length)); status = 206;
    } else headers.set('Content-Length', String(object.size));
    headers.set('Accept-Ranges', 'bytes');
    return new Response(request.method === 'HEAD' ? null : object.body, { status, headers });
  }
  if (path.startsWith('/api/collections/') && request.method === 'GET') {
    const id = path.slice('/api/collections/'.length);
    if (!/^[a-f0-9-]{36}$/.test(id)) return json({ error: 'Collection not found' }, 404);
    const object = await env.FILES.get(`${PRIVATE_PREFIX}collections/${id}.json`);
    if (!object) return json({ error: 'Collection not found' }, 404);
    const collection = await object.json();
    const files = [];
    // Bounded batches avoid a request for each file competing with video previews.
    for (let i = 0; i < collection.names.length; i += 10) {
      const batch = await Promise.all(collection.names.slice(i, i + 10).map(name => env.FILES.head(name)));
      files.push(...batch.filter(Boolean).map(toFile));
    }
    return json({ title: collection.title, files, missing: collection.names.length - files.length });
  }

  if (!await authenticated(request, env)) return json({ error: 'Sign in to upload or create a collection.' }, 401);
  if (path === '/api/collections' && request.method === 'POST') {
    const { names, title } = await bodyJson(request);
    if (!Array.isArray(names) || !names.length || names.length > 100 || !names.every(validName) || typeof title !== 'string' || !title.trim() || title.length > 100) return json({ error: 'Choose 1–100 files and a collection name.' }, 400);
    const unique = [...new Set(names)];
    for (const name of unique) if (!await env.FILES.head(name)) return json({ error: 'A selected file no longer exists. Refresh and try again.' }, 404);
    const id = crypto.randomUUID();
    await env.FILES.put(`${PRIVATE_PREFIX}collections/${id}.json`, JSON.stringify({ title: title.trim(), names: unique, createdAt: new Date().toISOString() }), { httpMetadata: { contentType: 'application/json' } });
    return json({ id, url: `${url.origin}/?collection=${id}` }, 201);
  }
  if (path === '/api/uploads/start' && request.method === 'POST') {
    const { name, size, type } = await bodyJson(request);
    if (!validName(name) || name.includes('/') || !Number.isSafeInteger(size) || size < 0 || size > MAX_SIZE || (type && (typeof type !== 'string' || !/^[\w.+-]+\/[\w.+-]+$/.test(type)))) return json({ error: 'Invalid file. Maximum size is 5 GB.' }, 400);
    const key = `uploads/${crypto.randomUUID()}/${name}`;
    const options = { httpMetadata: { contentType: type || 'application/octet-stream' } };
    if (size === 0) { const obj = await env.FILES.put(key, new Uint8Array(), options); return json({ file: toFile(obj) }, 201); }
    const upload = await env.FILES.createMultipartUpload(key, options);
    return json({ key, uploadId: upload.uploadId, partSize: PART_SIZE }, 201);
  }
  if (path === '/api/uploads/part' && request.method === 'PUT') {
    const key = url.searchParams.get('key'); const uploadId = url.searchParams.get('uploadId'); const partNumber = Number(url.searchParams.get('part'));
    const length = Number(request.headers.get('Content-Length'));
    if (!validUpload(key, uploadId) || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 640 || !Number.isInteger(length) || length < 1 || length > PART_SIZE) return json({ error: 'Invalid upload part.' }, 400);
    const part = await env.FILES.resumeMultipartUpload(key, uploadId).uploadPart(partNumber, request.body);
    return json(part);
  }
  if (path === '/api/uploads/complete' && request.method === 'POST') {
    const { key, uploadId, parts } = await bodyJson(request);
    if (!validUpload(key, uploadId) || !Array.isArray(parts) || !parts.length || parts.length > 640 || !parts.every((p, i) => p.partNumber === i + 1 && typeof p.etag === 'string' && p.etag.length <= 1024)) return json({ error: 'Invalid upload completion.' }, 400);
    const object = await env.FILES.resumeMultipartUpload(key, uploadId).complete(parts);
    return json({ file: toFile(object) }, 201);
  }
  if (path === '/api/uploads/abort' && request.method === 'POST') {
    const { key, uploadId } = await bodyJson(request);
    if (!validUpload(key, uploadId)) return json({ error: 'Invalid upload.' }, 400);
    await env.FILES.resumeMultipartUpload(key, uploadId).abort();
    return json({ ok: true });
  }
  return json({ error: 'Not found' }, 404);
}
function validUpload(key, uploadId) {
  return validName(key) && /^uploads\/[a-f0-9-]{36}\/[^/]+$/.test(key) && typeof uploadId === 'string' && uploadId.length > 0 && uploadId.length < 1024;
}
export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch (error) {
      console.error('Jack Files request failed:', error.message);
      return json({ error: 'The request could not finish. Please retry.' }, 500);
    }
  },
};
