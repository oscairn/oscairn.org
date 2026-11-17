// Reads the published package repository from the browser (or node): repository.json, then the compact catalog when
// it names one, else the full index. Nothing here verifies signatures; callers must not present the data as verified.
import { entriesFromIndex, entryFromCatalogLine, entryFromIndex } from './catalog.mjs';

async function get(url, { timeout = 10000, cache } = {}) {
  const r = await fetch(url, { cache, signal: AbortSignal.timeout(timeout) });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r;
}
async function gunzipText(r) {
  if (typeof DecompressionStream === 'undefined') throw new Error('no DecompressionStream');
  const stream = r.body.pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** -> { entries, serial, asOf (Date), via: 'catalog' | 'index', root } */
export async function fetchRepository(site, opts = {}) {
  const rootResp = await get(site + 'repository.json', { ...opts, cache: 'no-cache' }); // revalidated with its etag
  const root = await rootResp.json();
  const lm = rootResp.headers.get('last-modified');
  const asOf = lm ? new Date(lm) : new Date();
  if (root.catalog?.path) {
    const r = await get(site + root.catalog.path, opts); // named by hash: cached freely
    const text = root.catalog.path.endsWith('.gz') ? await gunzipText(r) : await r.text();
    const lines = text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    return { entries: lines.filter((l) => l.id).map(entryFromCatalogLine), serial: root.serial, asOf, via: 'catalog', root };
  }
  const r = await get(site + root.index.path, opts);
  const index = JSON.parse(await gunzipText(r));
  return { entries: entriesFromIndex(index, site), serial: root.serial, asOf, via: 'index', root };
}

/** One package with its versions: from the per-package detail file when the catalog names a template, else the index. */
export async function fetchPackage(site, id, opts = {}) {
  const rootResp = await get(site + 'repository.json', { ...opts, cache: 'no-cache' });
  const root = await rootResp.json();
  if (root.catalog?.detail) {
    const r = await get(site + root.catalog.detail.replace('{id}', encodeURIComponent(id)), opts);
    return { entry: entryFromIndex(await r.json(), site), root };
  }
  const r = await get(site + root.index.path, opts);
  const index = JSON.parse(await gunzipText(r));
  const p = index.packages.find((x) => x.id === id);
  return { entry: p ? entryFromIndex(p, site) : null, root };
}
