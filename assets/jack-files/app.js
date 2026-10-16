const $ = id => document.getElementById(id);
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const publicBase = 'https://pub-347aa0ad8b93489db6fe959dca5c3b05.r2.dev';
const publicUrl = file => `${publicBase}/${file.name.split('/').map(encodeURIComponent).join('/')}`;
const downloadUrl = file => `/download?file=${encodeURIComponent(file.name)}`;
const mediaUrl = file => file.name.toLowerCase().endsWith('.svg') ? publicUrl(file) : `/media?file=${encodeURIComponent(file.name)}`;
const basename = name => name.split('/').pop();
const extension = name => basename(name).includes('.') ? basename(name).split('.').pop().toLowerCase() : '';
const title = name => basename(name).replace(/^\d{10,13}[-_]/, '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
const typeOf = file => {
  const ext = extension(file.name), mime = file.mimeType || '';
  if (mime.startsWith('image/') || ['jpg','jpeg','png','gif','webp','svg','avif','bmp'].includes(ext)) return 'image';
  if (mime.startsWith('video/') || ['mp4','mov','webm','avi','mkv'].includes(ext)) return 'video';
  if (mime.startsWith('audio/') || ['mp3','wav','m4a','ogg','aac','flac'].includes(ext)) return 'audio';
  if (['zip','rar','7z','gz','tar'].includes(ext)) return 'archive';
  if (['pdf','doc','docx','xls','xlsx','csv','txt','ppt','pptx','md'].includes(ext)) return 'document';
  return 'other';
};
const labels = { all:'All files', image:'Images', video:'Videos', audio:'Audio', document:'Documents', archive:'Archives', other:'Other' };
const icons = { image:'IMAGE', video:'VIDEO', audio:'♫ AUDIO', document:'DOCUMENT', archive:'ZIP', other:'FILE' };
function size(bytes) { if (bytes === 0) return '0 B'; if (!Number.isFinite(bytes)) return '—'; const i = Math.min(3, Math.floor(Math.log(Math.max(1, bytes)) / Math.log(1024))); return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${['B','KB','MB','GB'][i]}`; }
function date(value) { return value ? new Date(value).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : ''; }
function duration(seconds) { if (!Number.isFinite(seconds)) return ''; return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`; }
const state = { files:[], visible:[], selected:new Set(), folder:'', type:'all', view:'grid', auth:false, uploads:[], uploading:false, preview:null, durations:new Map(), collection:new URLSearchParams(location.search).get('collection') };
try { state.view = localStorage.getItem('jackfiles-view') === 'list' ? 'list' : 'grid'; } catch {}
let thumbnailObserver, toastTimer, zipWorker, pendingAction;
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 4500); }
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...(options.body && typeof options.body === 'string' ? { 'Content-Type':'application/json' } : {}), ...options.headers } });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'Please try again.'); error.status = response.status; throw error; }
  return data;
}
const post = (path, data) => api(path, { method:'POST', body:JSON.stringify(data) });
async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch { toast('Copy is unavailable in this browser. Select and copy the link manually.'); } }

async function loadFiles() {
  $('refresh').disabled = true; $('status').textContent = 'Loading files…';
  try {
    let files = [];
    if (state.collection) {
      const collection = await api(`/api/collections/${encodeURIComponent(state.collection)}`);
      files = collection.files; document.title = `${collection.title} · Jack’s Files`;
      $('pageTitle').textContent = collection.title; $('eyebrow').textContent = 'SHARED COLLECTION'; $('allFilesLink').hidden = false;
      $('status').textContent = collection.missing ? `${collection.missing} file(s) are no longer available.` : 'Select any files to download together, or preview them below.';
    } else {
      let cursor;
      do { const page = await api('/api/files' + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : '')); files.push(...page.files); cursor = page.cursor; } while (cursor);
      $('status').textContent = '';
    }
    state.files = files;
    const names = new Set(files.map(f => f.name)); state.selected = new Set([...state.selected].filter(n => names.has(n)));
    renderFolders(); renderTypes(); render();
  } catch (error) { $('status').textContent = error.message; $('files').innerHTML = '<p class="empty">Could not load files. Use Refresh to try again.</p>'; }
  finally { $('refresh').disabled = false; }
}
function folderOf(file) { const parts = file.name.split('/'); return parts.length > 1 ? parts[0] : ''; }
function renderFolders() {
  const counts = new Map(); for (const file of state.files) { const folder = folderOf(file); if (folder) counts.set(folder, (counts.get(folder) || 0) + 1); }
  $('folders').innerHTML = `<button data-folder="" class="${state.folder === '' ? 'active' : ''}">All folders <span class="count">${state.files.length}</span></button>` + [...counts].sort((a,b) => a[0].localeCompare(b[0])).map(([folder,count]) => `<button data-folder="${escape(folder)}" class="${folder === state.folder ? 'active' : ''}">${escape(folder)} <span class="count">${count}</span></button>`).join('');
}
function renderTypes() {
  $('types').innerHTML = Object.entries(labels).filter(([type]) => type === 'all' || state.files.some(f => typeOf(f) === type)).map(([type,label]) => `<button data-type="${type}" class="${type === state.type ? 'active' : ''}" aria-pressed="${type === state.type}">${label}</button>`).join('');
}
function render() {
  thumbnailObserver?.disconnect();
  const query = $('search').value.trim().toLowerCase();
  state.visible = state.files.filter(f => (!state.folder || folderOf(f) === state.folder) && (state.type === 'all' || typeOf(f) === state.type) && (!query || `${f.name} ${title(f.name)}`.toLowerCase().includes(query)));
  const sort = $('sort').value;
  state.visible.sort((a,b) => sort === 'name' ? title(a.name).localeCompare(title(b.name)) : sort === 'largest' ? b.size-a.size : sort === 'smallest' ? a.size-b.size : sort === 'type' ? typeOf(a).localeCompare(typeOf(b)) || a.name.localeCompare(b.name) : sort === 'oldest' ? new Date(a.uploadedAt)-new Date(b.uploadedAt) : new Date(b.uploadedAt)-new Date(a.uploadedAt));
  $('summary').textContent = `${state.visible.length} ${state.visible.length === 1 ? 'file' : 'files'} · ${size(state.visible.reduce((n,f) => n+f.size,0))}${state.visible.length !== state.files.length ? ` of ${state.files.length} files` : ''}`;
  $('files').className = `files ${state.view}-view`;
  $('gridView').setAttribute('aria-pressed', String(state.view === 'grid')); $('listView').setAttribute('aria-pressed', String(state.view === 'list'));
  $('files').innerHTML = state.visible.length ? state.visible.map((f,i) => {
    const type = typeOf(f), name = escape(f.name), src = escape(mediaUrl(f));
    const thumbnail = type === 'image' ? `<img src="${src}" alt="" loading="lazy">` : type === 'video' ? `<video data-src="${src}" preload="none" muted playsinline aria-hidden="true"></video>` : `<span class="file-icon">${icons[type]}</span>`;
    const known = state.durations.get(f.name);
    return `<article class="file-card ${state.selected.has(f.name) ? 'selected' : ''}" data-index="${i}"><label class="select-file"><input type="checkbox" data-select="${i}" aria-label="Select ${name}" ${state.selected.has(f.name) ? 'checked' : ''}></label><button class="file-preview" data-preview="${i}" aria-label="Preview ${name}">${thumbnail}<span class="preview-label">${type === 'video' ? '▶ Play video' : type === 'audio' ? '▶ Listen' : 'Preview'}</span>${type === 'video' ? `<span class="duration" ${known ? '' : 'hidden'}>${duration(known)}</span>` : ''}</button><div class="file-info"><a class="file-title" href="${escape(downloadUrl(f))}" data-title-preview="${i}">${escape(title(f.name) || basename(f.name))}</a><p class="file-original">${escape(basename(f.name))}</p><div class="file-details"><span>${escape(extension(f.name).toUpperCase() || type)}</span><span>·</span><span>${size(f.size)}</span><span>·</span><span>${date(f.uploadedAt)}</span></div><div class="file-actions"><a class="button" href="${escape(downloadUrl(f))}" download>↓ Download</a><button data-copy="${i}">Copy link</button></div></div></article>`;
  }).join('') : '<p class="empty">No matching files. Try a different search, folder or file type.</p>';
  for (const image of $('files').querySelectorAll('img')) image.addEventListener('error', () => image.replaceWith(Object.assign(document.createElement('span'), { className:'file-icon', textContent:'IMAGE' })), { once:true });
  thumbnailObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const video = entry.target; thumbnailObserver.unobserve(video);
      video.addEventListener('loadedmetadata', () => {
        const f = state.visible[Number(video.closest('[data-index]').dataset.index)];
        state.durations.set(f.name, video.duration);
        const badge = video.parentElement.querySelector('.duration'); badge.textContent = duration(video.duration); badge.hidden = !badge.textContent;
        if (video.duration > 0) video.currentTime = Math.min(1, video.duration / 2);
      }, { once:true });
      video.addEventListener('error', () => { video.replaceWith(Object.assign(document.createElement('span'), { className:'file-icon', textContent:'VIDEO' })); }, { once:true });
      video.src = video.dataset.src; video.preload = 'metadata'; video.load();
    }
  }, { rootMargin:'80px' });
  $('files').querySelectorAll('video').forEach(v => thumbnailObserver.observe(v));
  renderSelection();
}
function selectedFiles() { return state.files.filter(f => state.selected.has(f.name)); }
function renderSelection() {
  const files = selectedFiles(), total = files.reduce((n,f) => n+f.size,0);
  $('selectionBar').hidden = !files.length && !zipWorker;
  $('selectionCount').textContent = !files.length && zipWorker ? 'Preparing ZIP…' : `${files.length} selected · ${size(total)}`;
  $('copySelected').disabled = !files.length;
  $('shareSelected').disabled = !files.length || files.length > 100;
  if (!zipWorker) { $('downloadSelected').disabled = !files.length || files.length > 100 || total > 500 * 1024 ** 2; $('downloadSelected').title = total > 500 * 1024 ** 2 ? 'Choose 500 MB or less for a ZIP. Individual downloads have no ZIP limit.' : ''; }
  $('selectVisible').textContent = state.visible.length && state.visible.every(f => state.selected.has(f.name)) ? 'Deselect visible' : 'Select visible';
}
function openPreview(file) {
  clearPreview(); state.preview = file;
  $('previewTitle').textContent = basename(file.name); $('previewMeta').textContent = `${size(file.size)} · ${date(file.uploadedAt)} · ${file.name}`;
  const type = typeOf(file); let media;
  if (type === 'image') { media = document.createElement('img'); media.alt = basename(file.name); }
  if (type === 'video' || type === 'audio') { media = document.createElement(type); media.controls = true; media.preload = 'metadata'; if (type === 'video') media.playsInline = true; }
  if (extension(file.name) === 'pdf') { media = document.createElement('iframe'); media.title = basename(file.name); }
  if (media) { media.src = mediaUrl(file); media.addEventListener('error', () => toast('Preview unavailable in this browser. You can still download the original.')); $('previewBody').append(media); }
  else $('previewBody').textContent = 'This file type has no browser preview. Download it or open the original.';
  $('previewDownload').href = downloadUrl(file); $('previewOpen').href = publicUrl(file);
  const i = state.visible.findIndex(f => f.name === file.name); $('previousFile').disabled = i <= 0; $('nextFile').disabled = i < 0 || i >= state.visible.length-1;
  if (!$('previewDialog').open) $('previewDialog').showModal();
}
function clearPreview() { for (const media of $('previewBody').querySelectorAll('video,audio')) { media.pause(); media.removeAttribute('src'); media.load(); } $('previewBody').replaceChildren(); }
function movePreview(direction) { const i = state.visible.findIndex(f => f.name === state.preview?.name); if (state.visible[i+direction]) openPreview(state.visible[i+direction]); }
function downloadBlob(blob, name) { const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
function downloadSelection() {
  if (zipWorker) { zipWorker.terminate(); zipWorker = null; $('downloadSelected').textContent = 'Download ZIP'; renderSelection(); toast('ZIP cancelled'); return; }
  const files = selectedFiles();
  zipWorker = new Worker('/archive-worker.js', { type:'module' }); $('downloadSelected').textContent = 'Cancel ZIP'; $('status').textContent = 'Preparing your ZIP…';
  const finish = () => { zipWorker?.terminate(); zipWorker = null; $('downloadSelected').textContent = 'Download ZIP'; renderSelection(); };
  zipWorker.onmessage = ({data}) => {
    if (data.progress) $('status').textContent = `Preparing ZIP · ${Math.min(100,Math.round(data.progress.loaded / Math.max(1,data.progress.total)*100))}% · ${data.progress.name}`;
    if (data.error) { finish(); $('status').textContent = data.error; }
    if (data.blob) { downloadBlob(data.blob, 'jack-files.zip'); finish(); $('status').textContent = 'Your ZIP is ready. Check your downloads.'; }
  };
  zipWorker.onerror = () => { finish(); $('status').textContent = 'Could not create the ZIP. Please retry or download files individually.'; };
  zipWorker.postMessage({ files:files.map(f => ({ name:f.name, size:f.size, downloadUrl:downloadUrl(f) })) });
}
function showCollectionDialog() { $('collectionResult').hidden = true; $('collectionMessage').textContent = ''; $('collectionDialog').showModal(); }
async function shareSelection() { if (!state.auth) { pendingAction = showCollectionDialog; showUpload(); toast('Sign in once to create collection links.'); return; } showCollectionDialog(); }
async function session() { try { const data = await api('/api/session'); setAuth(data.authenticated); } catch { setAuth(false); } }
function setAuth(value) { state.auth = value; $('loginForm').hidden = value; $('dropzone').hidden = !value; $('signOut').hidden = !value; }
function showUpload() { $('uploadPanel').hidden = false; $('uploadPanel').scrollIntoView({behavior:'auto',block:'start'}); if (!state.auth) $('password').focus(); }
function addFiles(files) {
  for (const file of files) {
    if (file.size > 5 * 1024 ** 3) { toast(`${file.name} is larger than 5 GB.`); continue; }
    state.uploads.push({ id:crypto.randomUUID(), file, progress:0, status:'waiting', cancelled:false });
  }
  showUpload(); renderUploads(); runUploads();
}
function renderUploads() {
  $('uploadQueue').innerHTML = state.uploads.map(item => `<div class="upload-item" data-upload="${item.id}"><div class="upload-item-head"><strong>${escape(item.file.name)}</strong><span class="muted">${size(item.file.size)}</span></div><progress max="100" value="${item.progress}" aria-label="Upload progress for ${escape(item.file.name)}"></progress><p class="muted">${escape(item.status === 'waiting' ? state.auth ? 'Waiting…' : 'Waiting for sign-in' : item.status === 'uploading' ? `Uploading… ${item.progress}%` : item.status === 'complete' ? 'Uploaded · public link ready' : item.status === 'finalizing' ? 'Finishing upload…' : item.message || item.status)}</p>${item.result ? `<div class="actions"><button data-upload-copy="${item.id}">Copy link</button><a class="button" href="${escape(publicUrl(item.result))}" target="_blank" rel="noopener">Open file ↗</a></div><a href="${escape(publicUrl(item.result))}" target="_blank" rel="noopener">${escape(publicUrl(item.result))}</a>` : `<div class="actions">${item.status === 'finalizing' ? '<button disabled>Finishing…</button>' : item.status === 'error' || item.status === 'cancelled' ? `<button data-upload-retry="${item.id}">Retry</button>` : `<button data-upload-cancel="${item.id}">Cancel</button>`}</div>`}</div>`).join('');
}
function uploadPart(item, blob, part) {
  return new Promise((resolve,reject) => {
    const xhr = new XMLHttpRequest(); item.xhr = xhr;
    const params = new URLSearchParams({ key:item.upload.key, uploadId:item.upload.uploadId, part:String(part) });
    xhr.open('PUT', `/api/uploads/part?${params}`); xhr.timeout = 180000;
    xhr.upload.onprogress = event => { item.progress = Math.floor(Math.min(99,(item.sent + event.loaded) / item.file.size * 100)); const row = document.querySelector(`[data-upload="${item.id}"]`); if (row) { row.querySelector('progress').value = item.progress; row.querySelector('p').textContent = `Uploading… ${item.progress}%`; } };
    xhr.onload = () => { try { const data = JSON.parse(xhr.responseText); if (xhr.status >= 200 && xhr.status < 300) resolve(data); else { const error = new Error(data.error || 'Upload failed'); error.status = xhr.status; reject(error); } } catch { reject(new Error('Upload failed. Please retry.')); } };
    xhr.onerror = xhr.ontimeout = () => reject(new Error('Connection interrupted. Please retry.'));
    xhr.onabort = () => reject(new Error('Cancelled')); xhr.send(blob);
  });
}
async function uploadOne(item) {
  item.status = item.file.size === 0 ? 'finalizing' : 'uploading'; item.progress = 0; item.sent = 0; renderUploads();
  try {
    const start = await post('/api/uploads/start', { name:item.file.name, size:item.file.size, type:item.file.type || 'application/octet-stream' });
    item.upload = start;
    if (item.cancelled) throw new Error('Cancelled');
    if (start.file) item.result = start.file;
    else {
      const parts = [];
      for (let offset = 0, part = 1; offset < item.file.size; offset += start.partSize, part++) {
        if (item.cancelled) throw new Error('Cancelled');
        const blob = item.file.slice(offset, offset+start.partSize); let result;
        for (let attempt = 0; attempt < 3; attempt++) {
          try { result = await uploadPart(item,blob,part); break; }
          catch (error) { if (item.cancelled || error.status === 401 || attempt === 2) throw error; await new Promise(r => setTimeout(r,500 * (attempt+1))); }
        }
        parts.push(result); item.sent += blob.size;
      }
      if (item.cancelled) throw new Error('Cancelled');
      item.status = 'finalizing'; renderUploads();
      const result = await post('/api/uploads/complete', { key:start.key, uploadId:start.uploadId, parts }); item.result = result.file;
    }
    item.status = 'complete'; item.progress = 100;
    if (!state.collection) { state.files = [item.result,...state.files.filter(f => f.name !== item.result.name)]; renderFolders(); renderTypes(); render(); }
  } catch (error) {
    if (item.upload?.uploadId) { try { await post('/api/uploads/abort', { key:item.upload.key, uploadId:item.upload.uploadId }); } catch {} }
    item.status = item.cancelled ? 'cancelled' : 'error'; item.message = item.cancelled ? 'Cancelled' : error.message;
    if (error.status === 401) { setAuth(false); $('uploadMessage').textContent = 'Your session expired. Sign in and retry.'; }
  } finally { item.xhr = null; renderUploads(); }
}
async function runUploads() {
  if (state.uploading || !state.auth) return;
  state.uploading = true; $('signOut').disabled = true;
  try { let next; while (state.auth && (next = state.uploads.find(item => item.status === 'waiting' && !item.cancelled))) await uploadOne(next); }
  finally { state.uploading = false; $('signOut').disabled = false; }
}

$('files').addEventListener('click', event => {
  const preview = event.target.closest('[data-preview],[data-title-preview]');
  if (preview) { event.preventDefault(); openPreview(state.visible[Number(preview.dataset.preview ?? preview.dataset.titlePreview)]); }
  const copyButton = event.target.closest('[data-copy]'); if (copyButton) copy(publicUrl(state.visible[Number(copyButton.dataset.copy)]));
});
$('files').addEventListener('change', event => { if (event.target.dataset.select !== undefined) { const file = state.visible[Number(event.target.dataset.select)]; if (event.target.checked) state.selected.add(file.name); else state.selected.delete(file.name); event.target.closest('.file-card').classList.toggle('selected',event.target.checked); renderSelection(); } });
$('folders').addEventListener('click', event => { const button = event.target.closest('[data-folder]'); if (button) { state.folder = button.dataset.folder; renderFolders(); render(); } });
$('types').addEventListener('click', event => { const button = event.target.closest('[data-type]'); if (button) { state.type = button.dataset.type; renderTypes(); render(); } });
$('search').addEventListener('input',render); $('sort').addEventListener('change',render); $('refresh').addEventListener('click',loadFiles);
for (const view of ['grid','list']) $(view+'View').addEventListener('click', () => { state.view = view; try { localStorage.setItem('jackfiles-view',view); } catch {} render(); });
$('selectVisible').addEventListener('click', () => { const all = state.visible.every(f => state.selected.has(f.name)); for (const f of state.visible) all ? state.selected.delete(f.name) : state.selected.add(f.name); render(); });
$('clearSelected').addEventListener('click', () => { state.selected.clear(); render(); });
$('copySelected').addEventListener('click', () => copy(selectedFiles().map(publicUrl).join('\n')));
$('downloadSelected').addEventListener('click',downloadSelection); $('shareSelected').addEventListener('click',shareSelection);
$('closePreview').addEventListener('click', () => $('previewDialog').close()); $('previewDialog').addEventListener('close', () => { clearPreview(); state.preview = null; });
$('previousFile').addEventListener('click', () => movePreview(-1)); $('nextFile').addEventListener('click', () => movePreview(1)); $('previewCopy').addEventListener('click', () => copy(publicUrl(state.preview)));
for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click', event => { if (event.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); });
document.addEventListener('keydown', event => {
  if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  if ($('previewDialog').open && ['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); movePreview(event.key === 'ArrowLeft' ? -1 : 1); }
  if (!document.querySelector('dialog[open]') && event.key === '/') { event.preventDefault(); $('search').focus(); }
});
$('closeCollection').addEventListener('click', () => $('collectionDialog').close());
$('collectionForm').addEventListener('submit', async event => {
  event.preventDefault(); $('createCollection').disabled = true; $('collectionMessage').textContent = 'Creating your collection…';
  try { const result = await post('/api/collections', { title:$('collectionTitle').value, names:selectedFiles().map(f => f.name) }); $('collectionLink').value = result.url; $('openCollection').href = result.url; $('collectionResult').hidden = false; $('collectionMessage').textContent = 'Ready to share. This link keeps the files you selected.'; }
  catch (error) { $('collectionMessage').textContent = error.message; if (error.status === 401) { setAuth(false); pendingAction = showCollectionDialog; $('collectionDialog').close(); showUpload(); } }
  finally { $('createCollection').disabled = false; }
});
$('copyCollection').addEventListener('click', () => copy($('collectionLink').value));
$('uploadToggle').addEventListener('click',showUpload); $('closeUpload').addEventListener('click', () => $('uploadPanel').hidden = true);
$('loginForm').addEventListener('submit', async event => { event.preventDefault(); const button = $('loginForm').querySelector('button'); button.disabled = true; $('uploadMessage').textContent = ''; try { await post('/api/login',{password:$('password').value}); $('password').value = ''; setAuth(true); renderUploads(); runUploads(); if (pendingAction) { const action = pendingAction; pendingAction = null; action(); } } catch (error) { $('uploadMessage').textContent = error.message; } finally { button.disabled = false; } });
$('signOut').addEventListener('click', async () => { try { await post('/api/logout',{}); setAuth(false); toast('Signed out'); } catch (error) { toast(error.message); } });
$('dropzone').addEventListener('click', () => $('fileInput').click()); $('dropzone').addEventListener('keydown', event => { if (['Enter',' '].includes(event.key)) { event.preventDefault(); $('fileInput').click(); } });
$('fileInput').addEventListener('change', event => { addFiles([...event.target.files]); event.target.value = ''; });
document.addEventListener('dragover', event => { if ([...event.dataTransfer.types].includes('Files')) { event.preventDefault(); if (!$('uploadPanel').hidden) $('dropzone').classList.add('dragover'); } });
document.addEventListener('dragleave', event => { if (!event.relatedTarget) $('dropzone').classList.remove('dragover'); });
document.addEventListener('drop', event => { if (event.dataTransfer.files.length) { event.preventDefault(); $('dropzone').classList.remove('dragover'); addFiles([...event.dataTransfer.files]); } });
$('uploadQueue').addEventListener('click', event => {
  const button = event.target.closest('button'); if (!button) return;
  for (const action of ['copy','cancel','retry']) {
    const id = button.dataset['upload'+action[0].toUpperCase()+action.slice(1)]; if (!id) continue;
    const item = state.uploads.find(i => i.id === id);
    if (action === 'copy') copy(publicUrl(item.result));
    if (action === 'cancel' && ['waiting','uploading'].includes(item.status)) { item.cancelled = true; item.xhr?.abort(); if (item.status === 'waiting') { item.status = 'cancelled'; renderUploads(); } }
    if (action === 'retry') { item.cancelled = false; item.status = 'waiting'; item.message = ''; item.progress = 0; renderUploads(); runUploads(); }
  }
});
window.addEventListener('beforeunload', event => { if (state.uploading) { event.preventDefault(); event.returnValue = ''; } });
await Promise.all([session(),loadFiles()]);
