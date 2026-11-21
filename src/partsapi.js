// Parts catalog connectors. First real adapter: Autodoc Parts Catalog on RapidAPI.
// Called server-side only. The RapidAPI key lives in the Worker secret RAPIDAPI_KEY and never
// reaches the browser. Responses are cached in D1 (api_cache) to save quota.
// Provider is the setting `vin_parts_provider`: 'sample' (built-in labeled samples), 'autodoc', 'autodoc_mock'.
import { json, bad } from './util.js';

const HOST = 'autodoc-parts-catalog.p.rapidapi.com';
// Provider setting values. 'partstech_autodoc' = PartsTech first for North American VINs, Autodoc as backup, samples last.
export const PROVIDERS = ['sample', 'autodoc', 'autodoc_mock', 'partstech_autodoc', 'partstech_mock'];
const TTL = { vin: 30 * 86400, categories: 14 * 86400, articles: 7 * 86400, details: 14 * 86400, oem: 30 * 86400, media: 30 * 86400, search: 14 * 86400 };

export async function ensureCache(env) {
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS api_cache (k TEXT PRIMARY KEY, body TEXT, status INTEGER, created INTEGER)').run();
}

async function provider(env) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE location_id=0 AND key='vin_parts_provider'").first().catch(() => null);
  const v = String(r?.value || '').replace(/^"|"$/g, '');
  return PROVIDERS.includes(v) ? v : 'sample';
}

export class ApiError extends Error { constructor(code, msg, retry) { super(msg); this.code = code; this.retry = retry; } }

// One call to Autodoc, with D1 cache and graceful errors
async function call(env, kind, path, { method = 'GET', body = null, mock = false } = {}) {
  const key = `autodoc:${method}:${path}:${body ? JSON.stringify(body) : ''}`;
  await ensureCache(env);
  const now = Math.floor(Date.now() / 1000);
  const hit = await env.DB.prepare('SELECT body, created FROM api_cache WHERE k=?').bind(key).first();
  if (hit && now - hit.created < (TTL[kind] || 86400)) return { data: JSON.parse(hit.body), cached: true };
  if (mock) {
    const data = MOCK(kind, path, body);
    return { data, cached: false, mock: true };
  }
  if (!env.RAPIDAPI_KEY) throw new ApiError('no_key', 'No RapidAPI key is stored on the server.');
  const init = { method, headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': env.RAPIDAPI_KEY } };
  if (body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(`https://${HOST}${path}`, { ...init, signal: AbortSignal.timeout(15000) }); }
  catch (e) { if (hit) return { data: JSON.parse(hit.body), cached: true, stale: true }; throw new ApiError('network', 'Autodoc did not answer in time.'); }
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  if (res.status === 429) { if (hit) return { data: JSON.parse(hit.body), cached: true, stale: true }; throw new ApiError('rate_limited', 'RapidAPI rate limit or monthly quota reached.', Number(res.headers.get('retry-after')) || 60); }
  if (res.status === 401 || res.status === 403) throw new ApiError('not_subscribed', String(data?.message || 'RapidAPI refused the key') + ' Subscribe to Autodoc Parts Catalog on RapidAPI with the account that owns this key.');
  if (res.status === 404) return { data: null, cached: false };
  if (!res.ok) { if (hit) return { data: JSON.parse(hit.body), cached: true, stale: true }; throw new ApiError('upstream', `Autodoc error ${res.status}`); }
  await env.DB.prepare('INSERT OR REPLACE INTO api_cache (k, body, status, created) VALUES (?,?,?,?)').bind(key, JSON.stringify(data), res.status, now).run();
  return { data, cached: false };
}

// ---------- tolerant normalizers (Autodoc / TecDoc-style field names) ----------
const pick = (o, ...ks) => { for (const k of ks) { if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; } return null; };
function arraysIn(d) {
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') for (const k of ['articles', 'data', 'items', 'result', 'results', 'vehicles', 'models', 'list', 'matchingVehicles', 'array']) if (Array.isArray(d[k])) return d[k];
  if (d && typeof d === 'object') for (const v of Object.values(d)) if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v;
  return [];
}
export function normArticle(a) {
  const img = pick(a, 's3image', 'image', 'imageLink', 'imageUrl', 'articleMediaFileName', 'picture');
  const price = pick(a, 'price', 'articlePrice', 'priceValue');
  return {
    article_id: pick(a, 'articleId', 'articleID', 'id'),
    article_no: pick(a, 'articleNo', 'articleNumber', 'articleSearchNo', 'number'),
    brand: pick(a, 'supplierName', 'brandName', 'brand', 'supplier'),
    supplier_id: pick(a, 'supplierId', 'brandId'),
    name: pick(a, 'articleProductName', 'productName', 'genericArticleDescription', 'name', 'description') || 'Part',
    product_id: pick(a, 'productId', 'genericArticleId'),
    image: img && /^https?:/.test(img) ? img : img ? `https://digital-assets.tecalliance.services/images/400/${img}` : null,
    price: price !== null ? Number(price) : null,
    currency: pick(a, 'currency', 'priceCurrency'),
    oems: [],
  };
}
function normOems(d) {
  // -> { [articleId]: [{brand, no}] }
  const out = {};
  for (const r of arraysIn(d)) {
    const id = pick(r, 'articleId', 'articleID');
    const list = arraysIn(pick(r, 'oemNo', 'oemNumbers', 'oems', 'articleOemNo') || []);
    const items = (list.length ? list : [r]).map((o) => ({ brand: pick(o, 'oemBrand', 'brandName', 'manufacturerName', 'mfrName') || '', no: pick(o, 'oemDisplayNo', 'oemNumber', 'articleOemNo', 'oemNo', 'number') || '' })).filter((o) => o.no && typeof o.no !== 'object');
    if (id) out[id] = [...(out[id] || []), ...items];
  }
  return out;
}
function flattenCats(d, path = [], out = []) {
  if (!d) return out;
  if (Array.isArray(d)) { for (const x of d) flattenCats(x, path, out); return out; }
  if (typeof d !== 'object') return out;
  const id = pick(d, 'categoryId', 'productGroupId', 'id', 'strId');
  const name = pick(d, 'categoryName', 'text', 'name', 'productGroupName', 'description');
  const kids = pick(d, 'children', 'subCategories', 'childs', 'categories');
  const here = name ? [...path, name] : path;
  const hasKids = kids && (Array.isArray(kids) ? kids.length : Object.keys(kids).length);
  if (id && name && !hasKids) out.push({ id, name, path: here.join(' > ') });
  if (kids) flattenCats(Array.isArray(kids) ? kids : Object.entries(kids).map(([k, v]) => (typeof v === 'object' && v && !pick(v, 'categoryId', 'id') ? { categoryId: k, ...v } : v)), here, out);
  else if (!id) for (const [k, v] of Object.entries(d)) if (v && typeof v === 'object') flattenCats(pick(v, 'categoryId', 'id') ? v : { categoryId: k, ...v }, path, out);
  return out;
}
function normVin(d) {
  const arr = arraysIn(d);
  const first = arr[0] || (d && typeof d === 'object' ? d : {});
  const vid = pick(first, 'vehicleId', 'carId', 'typeId', 'kTypeId', 'ktype', 'linkageTargetId') || pick(d || {}, 'vehicleId', 'carId', 'kTypeId');
  return {
    vehicle_id: vid ? Number(vid) : null,
    label: [pick(first, 'manufacturerName', 'mfrName', 'make'), pick(first, 'modelName', 'model'), pick(first, 'typeEngineName', 'carName', 'typeName', 'engine')].filter(Boolean).join(' '),
    candidates: arr.slice(0, 12).map((v) => ({ vehicle_id: Number(pick(v, 'vehicleId', 'carId', 'typeId', 'kTypeId') || 0) || null, label: [pick(v, 'manufacturerName', 'mfrName'), pick(v, 'modelName'), pick(v, 'typeEngineName', 'carName', 'typeName')].filter(Boolean).join(' ') })).filter((v) => v.vehicle_id),
  };
}

// ---------- high-level operations ----------
const L = 4; // English
export async function autodocVehicle(env, vin, mock) {
  for (const v of ['decoder-v3', 'decoder-v1', 'decoder-v5']) {
    const r = await call(env, 'vin', `/api/vin/${v}/${encodeURIComponent(vin)}`, { mock });
    const n = normVin(r.data);
    if (n.vehicle_id || n.candidates.length) return { ...n, cached: r.cached, mock: !!r.mock };
  }
  return { vehicle_id: null, candidates: [], label: '' };
}
export async function autodocCategories(env, vehicleId, mock) {
  const r = await call(env, 'categories', `/api/category/type-id/1/products-groups-variant-1/${Number(vehicleId)}/lang-id/${L}`, { mock });
  return flattenCats(r.data);
}
export async function autodocSearchCategories(env, text, mock) {
  const r = await call(env, 'search', `/api/category/search-for-the-commodity-group-tree-by-description/type-id/1/lang-id/${L}/search-text/${encodeURIComponent(text.toUpperCase())}`, { mock });
  return flattenCats(r.data);
}
export async function autodocArticles(env, vehicleId, categoryId, mock) {
  const r = await call(env, 'articles', `/api/articles/list/type-id/1/vehicle-id/${Number(vehicleId)}/category-id/${Number(categoryId)}/lang-id/${L}`, { mock });
  const arts = arraysIn(r.data).slice(0, 40).map(normArticle).filter((a) => a.article_id || a.article_no);
  const ids = arts.map((a) => Number(a.article_id)).filter(Boolean).slice(0, 25);
  if (ids.length) {
    try {
      const o = await call(env, 'oem', '/api/articles/get-oems-by-list-of-articles-ids', { method: 'POST', body: { articleIds: ids }, mock });
      const map = normOems(o.data);
      for (const a of arts) a.oems = (map[a.article_id] || []).slice(0, 8);
    } catch (e) { /* OEM refs are optional */ }
  }
  return { articles: arts, cached: r.cached, mock: !!r.mock };
}
export async function autodocArticle(env, articleId, mock) {
  const id = Number(articleId);
  const d = await call(env, 'details', `/api/articles/details/article-id/${id}/lang-id/${L}`, { mock });
  const src = arraysIn(d.data)[0] || pick(d.data || {}, 'article') || d.data || {};
  const a = normArticle(src);
  a.specs = arraysIn(pick(src, 'allSpecifications', 'specifications', 'criteria') || []).slice(0, 20).map((s) => ({ name: pick(s, 'criteriaName', 'name') || '', value: pick(s, 'criteriaValue', 'value') || '' }));
  try { const m = await call(env, 'media', `/api/articles/article-all-media-info?langId=${L}&articleId=${id}`, { mock }); a.images = arraysIn(m.data).map((x) => pick(x, 'imageLink', 'imageURL800', 'imageURL400', 'url', 'fileName')).filter((u) => typeof u === 'string' && /^https?:/.test(u)).slice(0, 6); } catch { a.images = []; }
  try { const o = await call(env, 'oem', '/api/articles/get-oems-by-list-of-articles-ids', { method: 'POST', body: { articleIds: [id] }, mock }); a.oems = normOems(o.data)[id] || normOems(o.data)[String(id)] || []; } catch { a.oems = []; }
  if (!a.article_id) a.article_id = id;
  return a;
}

// ---------- mock responses (used by provider 'autodoc_mock' and tests) ----------
function MOCK(kind, path, body) {
  if (kind === 'vin') return path.includes('decoder-v3') ? [{ vehicleId: 19942, manufacturerName: 'HONDA', modelName: 'ACCORD X', typeEngineName: '1.5 Turbo (CV1)' }] : [];
  if (kind === 'categories') return { categories: { 100001: { text: 'Body', children: { 100260: { text: 'Bumper', children: {} }, 100262: { text: 'Wing / Fender', children: {} } } }, 100018: { text: 'Lighting', children: { 100214: { text: 'Headlight', children: {} } } } } };
  if (kind === 'search') return [{ categoryId: 100214, categoryName: 'Headlight' }];
  if (kind === 'articles') return { articles: [
    { articleId: 5522538, articleNo: 'HD-1014', supplierName: 'MOCK BLIC', articleProductName: 'Bumper cover, front (mock)', s3image: 'https://example.invalid/mock-bumper.jpg', price: 189.0, currency: 'USD' },
    { articleId: 6822931, articleNo: '6410-01-2001', supplierName: 'MOCK VAN WEZEL', articleProductName: 'Bumper reinforcement, front (mock)' },
    { articleId: 75733765, articleNo: '17-6148', supplierName: 'MOCK DEPO', articleProductName: 'Headlight, left (mock)', price: 242.5, currency: 'USD' },
  ] };
  if (kind === 'oem') return (body?.articleIds || []).map((id) => ({ articleId: id, oemNo: [{ oemBrand: 'HONDA', oemDisplayNo: `71101-TVA-A${String(id).slice(-2)}` }] }));
  if (kind === 'details') { const id = Number(path.match(/article-id\/(\d+)/)?.[1]); return [{ articleId: id, articleNo: 'HD-1014', supplierName: 'MOCK BLIC', articleProductName: 'Bumper cover, front (mock)', price: 189.0, currency: 'USD', allSpecifications: [{ criteriaName: 'Fitting Position', criteriaValue: 'Front' }, { criteriaName: 'Paint', criteriaValue: 'Primed' }] }]; }
  if (kind === 'media') return [{ imageLink: 'https://example.invalid/mock-bumper-800.jpg' }];
  return {};
}

// ---------- PartsTech adapter (US aftermarket: live supplier pricing and availability) ----------
// Auth: POST /oauth/access with the shop's user ID and API key -> bearer JWT.
// The auth request requires both shop and integration-partner credentials.
const PT = 'https://api.partstech.com';
async function cacheGet(env, k, ttl) { await ensureCache(env); const r = await env.DB.prepare('SELECT body, created FROM api_cache WHERE k=?').bind(k).first(); return r && Math.floor(Date.now() / 1000) - r.created < ttl ? JSON.parse(r.body) : null; }
async function cachePut(env, k, v) { await env.DB.prepare('INSERT OR REPLACE INTO api_cache (k, body, status, created) VALUES (?,?,200,?)').bind(k, JSON.stringify(v), Math.floor(Date.now() / 1000)).run(); }
function ptReady(env) {
  return !!(env.PARTSTECH_USER_ID && env.PARTSTECH_USER_KEY && env.PARTSTECH_PARTNER_ID && env.PARTSTECH_PARTNER_KEY);
}
async function ptToken(env) {
  const hit = await cacheGet(env, 'pt:token', 3000); if (hit?.t) return hit.t;
  if (!env.PARTSTECH_USER_ID || !env.PARTSTECH_USER_KEY) throw new ApiError('no_key', 'PartsTech: no user ID and API key saved yet.');
  if (!env.PARTSTECH_PARTNER_ID || !env.PARTSTECH_PARTNER_KEY) throw new ApiError('no_key', 'PartsTech: integration partner ID and key are required. Request them from PartsTech.');
  const credentials = {
    user: { id: env.PARTSTECH_USER_ID, key: env.PARTSTECH_USER_KEY },
    partner: { id: env.PARTSTECH_PARTNER_ID, key: env.PARTSTECH_PARTNER_KEY },
  };
  const r = await fetch(PT + '/oauth/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000), body: JSON.stringify({ accessType: 'user', credentials }) }).catch(() => null);
  if (!r) throw new ApiError('network', 'PartsTech did not answer in time.');
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.accessToken) throw new ApiError(r.status === 429 ? 'rate_limited' : 'auth', d?.error?.message || `PartsTech sign-in failed (${r.status})`);
  await cachePut(env, 'pt:token', { t: d.accessToken });
  return d.accessToken;
}
async function ptCall(env, kind, path, body, ttl) {
  const k = `pt:${path}:${body ? JSON.stringify(body) : ''}`;
  const hit = ttl > 0 ? await cacheGet(env, k, ttl) : null; if (hit) return { data: hit, cached: true };
  const tok = await ptToken(env);
  const r = await fetch(PT + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!r) throw new ApiError('network', 'PartsTech did not answer in time.');
  if (r.status === 401) { await cachePut(env, 'pt:token', {}); throw new ApiError('auth', 'PartsTech session expired; try again.'); }
  if (r.status === 429) throw new ApiError('rate_limited', 'PartsTech rate limit reached.', Number(r.headers.get('retry-after')) || 60);
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError('upstream', d?.error?.message || `PartsTech error ${r.status}`);
  if (ttl > 0) await cachePut(env, k, d);
  return { data: d, cached: false };
}
function ptNorm(p) {
  const qty = (p.storesAvailability || []).reduce((a, s) => a + (Number(s.quantity) || 0), 0);
  const img = (p.images || [])[0]; const pr = p.price || {};
  return { article_id: p.partId, article_no: p.partNumber, brand: p.brand?.name || p.brand?.displayName || '', name: p.partName || p.taxonomy?.partType?.name || 'Part', image: img?.full || img?.medium || img?.preview || null,
    price: pr.cost ?? pr.price ?? pr.list ?? null, list_price: pr.list ?? null, core: pr.core || 0, currency: 'USD', available: qty, supplier: [p.supplier?.name, p.store?.name].filter(Boolean).join(' \u00b7 '), oems: [], source: 'partstech', url: p.partsTechCatalogURL || null };
}
const PT_MOCK = (q) => ({ parts: [
  { partId: 'm1', partNumber: 'HO1000312', partName: `${q} (mock)`, brand: { name: 'MOCK CAPA' }, price: { cost: 168.4, list: 241.0, core: 0, fet: 0 }, storesAvailability: [{ quantity: 3 }], supplier: { name: 'Mock Supplier' }, store: { name: 'Main St' } },
  { partId: 'm2', partNumber: '71101TVAA00', partName: `${q}, OE (mock)`, brand: { name: 'MOCK HONDA OE' }, price: { cost: 402.1, list: 512.3, core: 0, fet: 0 }, storesAvailability: [{ quantity: 0 }], supplier: { name: 'Mock Dealer' } },
] });
export async function partstechSearch(env, vin, q, mock) {
  if (mock) return { articles: PT_MOCK(q).parts.map(ptNorm), cached: false, mock: true };
  const st = await ptCall(env, 'stores', '/stores', null, 86400);
  const store = (Array.isArray(st.data) ? st.data : [])[0];
  if (!store) throw new ApiError('no_store', 'Your PartsTech account has no connected supplier store.');
  const r = await ptCall(env, 'quote', '/catalog/quote', { searchParams: { vin, keyword: q }, storeId: store.id }, 0);
  return { articles: (r.data?.parts || []).slice(0, 40).map(ptNorm), cached: r.cached, store: store.name };
}
async function autodocSearch(env, vin, q, mock) {
  const veh = await autodocVehicle(env, vin, mock);
  if (!veh.vehicle_id) return { articles: [], note: 'Autodoc has no match for this VIN.' };
  const cats = await autodocSearchCategories(env, q, mock);
  if (!cats.length) return { articles: [], vehicle: veh.label, note: 'No Autodoc category matches that word.' };
  const r = await autodocArticles(env, veh.vehicle_id, cats[0].id, mock);
  return { articles: r.articles.map((a) => ({ ...a, source: 'autodoc' })), vehicle: veh.label, category: cats[0].name, cached: r.cached, mock: r.mock };
}
const isNA = (vin) => /^[1-5]/.test(vin); // US, Canada, Mexico
export function sourceOrder(p, vin) {
  if (p === 'partstech_autodoc') return isNA(vin) ? ['partstech', 'autodoc'] : ['autodoc', 'partstech'];
  if (p === 'partstech_mock') return ['partstech_mock'];
  if (p === 'autodoc_mock') return ['autodoc_mock'];
  if (p === 'autodoc') return ['autodoc'];
  return [];
}
export async function unifiedSearch(env, p, vin, q) {
  const tried = [];
  for (const s of sourceOrder(p, vin)) {
    if (s === 'partstech' && !ptReady(env)) continue; // not set up yet: the owner sees why in Settings, searches stay quiet
    try {
      const r = s.startsWith('partstech') ? await partstechSearch(env, vin, q, s === 'partstech_mock') : await autodocSearch(env, vin, q, s === 'autodoc_mock');
      if (r.articles.length) return { ok: true, source: s.replace('_mock', ''), mock: s.endsWith('_mock'), tried, ...r };
      tried.push({ source: s, error: 'empty', message: r.note || 'No parts found' });
    } catch (e) { if (!(e instanceof ApiError)) throw e; tried.push({ source: s, error: e.code, message: e.message }); }
  }
  return { ok: false, source: 'sample', fallback: 'sample', tried, articles: [] };
}

// ---------- routes ----------
function fail(e) {
  if (e instanceof ApiError) return json({ ok: false, error: e.code, message: e.message, retry_after: e.retry || null, fallback: 'sample' }, 200);
  throw e;
}
export function partsRoutes(R) {
  R.get('/api/parts/status', async (c) => {
    c.need('jobs.read');
    const p = await provider(c.env);
    return json({ provider: p, key_set: !!c.env.RAPIDAPI_KEY, partstech_ready: ptReady(c.env), partstech_user_set: !!(c.env.PARTSTECH_USER_ID && c.env.PARTSTECH_USER_KEY), partstech_partner_set: !!(c.env.PARTSTECH_PARTNER_ID && c.env.PARTSTECH_PARTNER_KEY), host: HOST, note: 'Autodoc is mainly a European aftermarket catalog; US coverage and OEM pricing may be limited.' });
  });
  // Test the stored key without spending much quota (cached language list)
  R.post('/api/parts/test', async (c) => {
    c.need('catalog.write');
    const p = await provider(c.env);
    try {
      const out = { ok: true, provider: p };
      if (p.startsWith('partstech')) { if (p === 'partstech_mock') out.partstech = 'mock'; else { try { await ptToken(c.env); out.partstech = 'signed in'; } catch (e) { out.partstech = e.message; out.ok = false; } } }
      if (p.includes('autodoc')) { try { const r = await call(c.env, 'categories', '/api/languages/list', { mock: p === 'autodoc_mock' }); out.autodoc = r.mock ? 'mock' : 'ok'; } catch (e) { out.autodoc = e.message; if (p !== 'partstech_autodoc') out.ok = false; } }
      return json(out);
    } catch (e) { return fail(e); }
  });
  // One search across the configured sources, in order; samples are the caller's fallback
  R.get('/api/parts/search', async (c) => {
    c.need('jobs.read');
    const p = await provider(c.env);
    const vin = String(c.q('vin', '')).toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ''), q = String(c.q('q', '')).trim().slice(0, 80);
    if (vin.length !== 17 || !q) throw bad('vin (17) and q are required');
    if (p === 'sample') return json({ ok: false, source: 'sample', fallback: 'sample', tried: [], articles: [] });
    const r = await unifiedSearch(c.env, p, vin, q);
    // Setup and account problems are for the owner (Settings). Employees just see "no results".
    if (!c.can('shop.read') && r.tried) r.tried = r.tried.filter((t) => t.error === 'empty');
    return json(r);
  });
  R.get('/api/parts/vehicle', async (c) => {
    c.need('jobs.read');
    let p = await provider(c.env); if (p === 'sample' || p === 'partstech_mock') return json({ ok: false, error: 'provider_off', fallback: 'sample' }); if (p === 'partstech_autodoc') p = 'autodoc';
    const vin = String(c.q('vin', '')).toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    if (vin.length !== 17) throw bad('VIN must be 17 characters');
    try { return json({ ok: true, ...(await autodocVehicle(c.env, vin, p === 'autodoc_mock')) }); } catch (e) { return fail(e); }
  });
  R.get('/api/parts/categories', async (c) => {
    c.need('jobs.read');
    let p = await provider(c.env); if (p === 'sample' || p === 'partstech_mock') return json({ ok: false, error: 'provider_off', fallback: 'sample' }); if (p === 'partstech_autodoc') p = 'autodoc';
    try {
      const q = String(c.q('q', '')).trim();
      const cats = q ? await autodocSearchCategories(c.env, q, p === 'autodoc_mock') : await autodocCategories(c.env, c.q('vehicle_id', 0), p === 'autodoc_mock');
      return json({ ok: true, categories: cats.slice(0, 400) });
    } catch (e) { return fail(e); }
  });
  R.get('/api/parts/articles', async (c) => {
    c.need('jobs.read');
    let p = await provider(c.env); if (p === 'sample' || p === 'partstech_mock') return json({ ok: false, error: 'provider_off', fallback: 'sample' }); if (p === 'partstech_autodoc') p = 'autodoc';
    const vid = Number(c.q('vehicle_id', 0)), cid = Number(c.q('category_id', 0));
    if (!vid || !cid) throw bad('vehicle_id and category_id are required');
    try { return json({ ok: true, ...(await autodocArticles(c.env, vid, cid, p === 'autodoc_mock')) }); } catch (e) { return fail(e); }
  });
  R.get('/api/parts/article/:aid', async (c) => {
    c.need('jobs.read');
    let p = await provider(c.env); if (p === 'sample' || p === 'partstech_mock') return json({ ok: false, error: 'provider_off', fallback: 'sample' }); if (p === 'partstech_autodoc') p = 'autodoc';
    try { return json({ ok: true, article: await autodocArticle(c.env, c.params.aid, p === 'autodoc_mock') }); } catch (e) { return fail(e); }
  });
}
