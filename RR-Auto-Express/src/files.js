// File storage: R2 when a FILES bucket is bound, otherwise chunked BLOBs in D1.
import { HttpError } from './util.js';

const CHUNK = 1_500_000;
export const MAX_PHOTO = 12 * 1024 * 1024;
export const MAX_VIDEO = 40 * 1024 * 1024;
export const MAX_DOC = 15 * 1024 * 1024;

export async function saveFile(env, meta, bytes) {
  const size = bytes.byteLength;
  const isVideo = /^video\//.test(meta.content_type || '');
  const max = isVideo ? MAX_VIDEO : meta.category === 'document' ? MAX_DOC : MAX_PHOTO;
  if (size > max) throw new HttpError(413, `File too large (${Math.round(size / 1048576)} MB, limit ${Math.round(max / 1048576)} MB)`);
  const chunks = env.FILES ? 0 : Math.max(1, Math.ceil(size / CHUNK));
  const r = await env.DB.prepare('INSERT INTO files (job_id,location_id,category,kind,name,content_type,size,chunks,caption,parent_id,supplement_id,customer_visible,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id')
    .bind(meta.job_id || null, meta.location_id || null, meta.category || 'photo', meta.kind || 'other', meta.name || 'file', meta.content_type || 'application/octet-stream', size, chunks, meta.caption || null, meta.parent_id || null, meta.supplement_id || null, meta.customer_visible ? 1 : 0, meta.created_by || null)
    .first();
  const id = r.id;
  if (env.FILES) {
    await env.FILES.put(`f/${id}`, bytes, { httpMetadata: { contentType: meta.content_type } });
  } else {
    const u8 = new Uint8Array(bytes);
    const stmts = [];
    for (let i = 0; i < chunks; i++) stmts.push(env.DB.prepare('INSERT INTO file_chunks (file_id,idx,data) VALUES (?,?,?)').bind(id, i, u8.slice(i * CHUNK, (i + 1) * CHUNK).buffer));
    for (let i = 0; i < stmts.length; i += 4) await env.DB.batch(stmts.slice(i, i + 4));
  }
  return id;
}

export async function loadFileBytes(env, file) {
  if (!file) return null;
  if (env.FILES && !file.chunks) {
    const o = await env.FILES.get(`f/${file.id}`);
    return o ? new Uint8Array(await o.arrayBuffer()) : null;
  }
  const rows = await env.DB.prepare('SELECT idx, data FROM file_chunks WHERE file_id=? ORDER BY idx').bind(file.id).all();
  const parts = rows.results.map((r) => new Uint8Array(r.data));
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export async function fileResponse(env, file, req) {
  const bytes = await loadFileBytes(env, file);
  if (!bytes) throw new HttpError(404, 'File data missing');
  const headers = { 'Content-Type': file.content_type || 'application/octet-stream', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' };
  if (!/^(image|video)\//.test(file.content_type || '') && file.content_type !== 'application/pdf') headers['Content-Disposition'] = `attachment; filename="${(file.name || 'file').replace(/[^\w.\- ]/g, '_')}"`;
  const range = req.headers.get('Range');
  if (range && /^bytes=\d*-\d*$/.test(range)) {
    let [s, e] = range.slice(6).split('-');
    let start = s === '' ? Math.max(0, bytes.length - Number(e)) : Number(s);
    let end = s === '' || e === '' ? bytes.length - 1 : Math.min(Number(e), bytes.length - 1);
    if (start <= end) return new Response(bytes.slice(start, end + 1), { status: 206, headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } });
  }
  return new Response(bytes, { headers });
}

export async function deleteFile(env, file) {
  if (env.FILES && !file.chunks) await env.FILES.delete(`f/${file.id}`);
  await env.DB.batch([env.DB.prepare('DELETE FROM file_chunks WHERE file_id=?').bind(file.id), env.DB.prepare('DELETE FROM files WHERE id=?').bind(file.id)]);
}
