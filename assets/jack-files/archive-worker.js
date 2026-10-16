import { buildZip } from './archive.js';
self.onmessage = async ({ data }) => {
  try { const blob = await buildZip(data.files, progress => self.postMessage({ progress })); self.postMessage({ blob }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
