import { test } from 'node:test';
import { webcrypto } from 'node:crypto';
globalThis.crypto ??= webcrypto;
import assert from 'node:assert/strict';
import worker from '../assets/jack-files/_worker.js';
import { buildZip } from '../assets/jack-files/archive.js';

function storage() {
  const objects = new Map(), uploads = new Map();
  function object(key, body, options = {}) {
    const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
    return { key, size: bytes.length, uploaded: new Date('2026-10-16'), httpMetadata:options.httpMetadata || {}, httpEtag:'"test"', bytes,
      get body() { return new Response(bytes).body; }, json: async () => JSON.parse(new TextDecoder().decode(bytes)),
      writeHttpMetadata: headers => { if (options.httpMetadata?.contentType) headers.set('Content-Type', options.httpMetadata.contentType); } };
  }
  const bucket = {
    async put(key, body, options) { const obj = object(key, body, options); objects.set(key,obj); return obj; },
    async head(key) { return objects.get(key) || null; }, async get(key) { return objects.get(key) || null; },
    async list() { return { objects:[...objects.values()], truncated:false }; },
    async createMultipartUpload(key, options) { const uploadId = crypto.randomUUID(); uploads.set(uploadId,{ key, options, parts:new Map() }); return { uploadId }; },
    resumeMultipartUpload(key, id) { const active = uploads.get(id); assert.equal(active.key,key); return {
      async uploadPart(number, body) { active.parts.set(number, new Uint8Array(await new Response(body).arrayBuffer())); return {partNumber:number,etag:'a'.repeat(172)}; },
      async complete(parts) { const bytes = Buffer.concat(parts.map(p=>active.parts.get(p.partNumber))); const obj = await bucket.put(key,bytes,active.options); uploads.delete(id); return obj; },
      async abort() { uploads.delete(id); }
    }; },
  };
  return {bucket,objects,uploads};
}
const origin = 'https://jack-files.pages.dev';
function harness() {
  const store = storage(); const env = { FILES:store.bucket, UPLOAD_PASSWORD:'a-private-test-passphrase', ASSETS:{fetch:()=>new Response('static page')} };
  const request = (path, {method='GET',data,cookie,headers={},body}={}) => worker.fetch(new Request(origin+path,{ method, headers:{ ...(method!=='GET'?{Origin:origin}:{}), ...(cookie?{Cookie:cookie}:{}), ...headers }, body:body ?? (data===undefined?undefined:JSON.stringify(data)) }),env);
  const login = async () => { const res=await request('/api/login',{method:'POST',data:{password:env.UPLOAD_PASSWORD}}); assert.equal(res.status,200); return res.headers.get('Set-Cookie').split(';')[0]; };
  return { ...store,env,request,login };
}

test('uploads fail closed, reject cross-origin requests and validate signed sessions', async () => {
  const h = harness();
  assert.equal((await h.request('/api/uploads/start',{method:'POST',data:{}})).status,401);
  assert.equal((await h.request('/api/login',{method:'POST',data:{password:'wrong'}})).status,401);
  assert.equal((await h.request('/api/login',{method:'POST',data:{password:h.env.UPLOAD_PASSWORD},headers:{Origin:'https://evil.example'}})).status,403);
  const cookie=await h.login();
  assert.equal((await (await h.request('/api/session',{cookie})).json()).authenticated,true);
  const tampered = cookie.replace(/.$/,cookie.endsWith('0')?'1':'0');
  assert.equal((await (await h.request('/api/session',{cookie:tampered})).json()).authenticated,false);
  delete h.env.UPLOAD_PASSWORD;
  assert.equal((await (await h.request('/api/session',{cookie})).json()).authenticated,false);
});

test('multipart upload preserves bytes and filename, uses unique keys and aborts cleanly', async () => {
  const h=harness(), cookie=await h.login();
  const start=await (await h.request('/api/uploads/start',{method:'POST',cookie,data:{name:'Café (1).mp4',size:5,type:'video/mp4'}})).json();
  const part=await (await h.request(`/api/uploads/part?${new URLSearchParams({key:start.key,uploadId:start.uploadId,part:'1'})}`,{method:'PUT',cookie,body:'hello',headers:{'Content-Length':'5'}})).json();
  const done=await h.request('/api/uploads/complete',{method:'POST',cookie,data:{...start,parts:[part]}});
  assert.equal(done.status,201); assert.deepEqual(Buffer.from(h.objects.get(start.key).bytes),Buffer.from('hello'));
  assert.match(start.key,/^uploads\/[a-f0-9-]+\/Café \(1\).mp4$/);
  assert.equal((await h.request('/api/uploads/start',{method:'POST',cookie,data:{name:'../bad',size:1}})).status,400);
  assert.equal((await h.request('/api/uploads/start',{method:'POST',cookie,data:{name:'big.mp4',size:6*1024**3}})).status,400);
  const second=await (await h.request('/api/uploads/start',{method:'POST',cookie,data:{name:'Café (1).mp4',size:5}})).json();
  assert.notEqual(start.key,second.key);
  assert.equal((await h.request('/api/uploads/abort',{method:'POST',cookie,data:second})).status,200);
  assert.equal(h.uploads.size,0);
});

test('collections persist selected references and remain publicly readable, with missing files explicit', async () => {
  const h=harness(),cookie=await h.login();
  await h.bucket.put('one.txt','one'); await h.bucket.put('two.txt','two');
  const created=await h.request('/api/collections',{method:'POST',cookie,data:{title:'My collection',names:['one.txt']}});
  assert.equal(created.status,201); const {id}=await created.json();
  const result=await (await h.request('/api/collections/'+id)).json();
  assert.deepEqual(result.files.map(f=>f.name),['one.txt']);
  const listed=await (await h.request('/api/files')).json(); assert.equal(listed.files.length,2);
  assert.equal((await h.request('/download?file='+encodeURIComponent('.quickshare/collections/'+id+'.json'))).status,400);
  h.objects.delete('one.txt'); const missing=await (await h.request('/api/collections/'+id)).json(); assert.equal(missing.missing,1);
});

test('downloads are attachments, HTML stays an attachment and static routes still work', async () => {
  const h=harness(); await h.bucket.put('Café (1).mp4','hello',{httpMetadata:{contentType:'video/mp4'}});
  const response=await h.request('/download?file='+encodeURIComponent('Café (1).mp4'));
  assert.match(response.headers.get('Content-Disposition'),/^attachment;/);
  assert.match(response.headers.get('Content-Disposition'),/filename\*=UTF-8''Caf%C3%A9%20%281%29.mp4/);
  assert.equal(await response.text(),'hello');
  await h.bucket.put('test.html','<script>alert(1)</script>',{httpMetadata:{contentType:'text/html'}});
  assert.match((await h.request('/media?file=test.html')).headers.get('Content-Disposition'),/^attachment;/);
  for (const mime of ['image/SVG+xml', 'IMAGE/SVG+XML', 'image/svg+xml; charset=utf-8']) {
    await h.bucket.put('active.svg','<svg/>',{httpMetadata:{contentType:mime}});
    const svg=await h.request('/media?file=active.svg');
    assert.match(svg.headers.get('Content-Disposition'),/^attachment;/);
    assert.equal(svg.headers.get('Content-Type'),'image/svg+xml');
  }
  assert.equal((await h.request('/download?file=missing.txt')).status,404);
  assert.equal((await h.request('/download?file=..%2Fbad')).status,400);
  assert.equal(await (await h.request('/style.css')).text(),'static page');
});

test('ZIP rejects oversized selections and supports duplicate and Unicode filenames', async () => {
  await assert.rejects(buildZip([{size:501*1024**2}]),/500 MB/);
  const zip = await buildZip([{name:'a/café.txt',size:5,downloadUrl:'/a'},{name:'b/café.txt',size:5,downloadUrl:'/b'}],()=>{},async()=>new Response('hello'));
  const bytes=new Uint8Array(await zip.arrayBuffer());
  assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);
  const text=new TextDecoder().decode(bytes);
  assert.ok(text.includes('café.txt')); assert.ok(text.includes('café (2).txt'));
});
