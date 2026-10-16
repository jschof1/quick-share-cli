// Uncompressed ZIP with data descriptors. Media is already compressed; avoid a second copy of each file.
const enc = new TextEncoder();
const table = Uint32Array.from({ length: 256 }, (_, i) => { let n = i; for (let b = 0; b < 8; b++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function record(size, values) {
  const bytes = new Uint8Array(size); const view = new DataView(bytes.buffer);
  for (const [offset, value, width] of values) width === 2 ? view.setUint16(offset, value, true) : view.setUint32(offset, value >>> 0, true);
  return bytes;
}
export async function buildZip(files, progress = () => {}, fetcher = fetch) {
  const total = files.reduce((n, f) => n + f.size, 0);
  if (!files.length || files.length > 100 || total > 500 * 1024 ** 2) throw new Error('Choose up to 100 files, totalling 500 MB or less, for a ZIP.');
  const chunks = [], directory = [], seen = new Set(); let offset = 0, loaded = 0;
  for (const file of files) {
    let name = file.name.split('/').pop(), n = 2;
    const original = name;
    while (seen.has(name)) { const dot = original.lastIndexOf('.'); name = dot > 0 ? `${original.slice(0, dot)} (${n++})${original.slice(dot)}` : `${original} (${n++})`; }
    seen.add(name); const filename = enc.encode(name);
    const localOffset = offset;
    const header = record(30, [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x808, 2], [12, 33, 2], [26, filename.length, 2]]);
    chunks.push(header, filename); offset += header.length + filename.length;
    const response = await fetcher(file.downloadUrl);
    if (!response.ok) throw new Error(`Could not download ${original}. Please retry.`);
    const reader = response.body.getReader(); let crc = 0xffffffff, size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length; loaded += value.length;
      if (loaded > 500 * 1024 ** 2) { await reader.cancel(); throw new Error('ZIP exceeded the 500 MB limit. Choose fewer files.'); }
      for (const byte of value) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
      chunks.push(value); offset += value.length;
      progress({ loaded, total, name: original });
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const descriptor = record(16, [[0, 0x08074b50, 4], [4, crc, 4], [8, size, 4], [12, size, 4]]);
    chunks.push(descriptor); offset += descriptor.length;
    directory.push(record(46, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x808, 2], [14, 33, 2], [16, crc, 4], [20, size, 4], [24, size, 4], [28, filename.length, 2], [42, localOffset, 4]]), filename);
  }
  const directorySize = directory.reduce((n, chunk) => n + chunk.length, 0);
  chunks.push(...directory, record(22, [[0, 0x06054b50, 4], [8, files.length, 2], [10, files.length, 2], [12, directorySize, 4], [16, offset, 4]]));
  return new Blob(chunks, { type: 'application/zip' });
}
