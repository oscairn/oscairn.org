// Builds the package catalog from the package repository's records
// (packages/<id>/<version>.json). The published index adds each package's name from the
// archive's library.json, so this reads that file from the .olib (a zip) the same way.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PACKAGES_DIR, PACKAGES_SITE } from './config.mjs';
import { kindOf, compareVersions, formatSize } from './catalog.mjs';

/**
 * The published index (repository.json -> index/<sha256>.json.gz), fetched once at build for the per-platform
 * archive sizes. Never fails the build: without it, links are still made (from the records) but show no size.
 * OSCAIRN_OFFLINE=1 skips the fetch.
 */
async function fetchIndex() {
  if (process.env.OSCAIRN_OFFLINE) { console.log('[packages] OSCAIRN_OFFLINE set: archive links without sizes'); return null; }
  try {
    const get = async (u) => { const r = await fetch(u, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error(`${u}: ${r.status}`); return Buffer.from(await r.arrayBuffer()); };
    const root = JSON.parse(await get(PACKAGES_SITE + 'repository.json'));
    const index = JSON.parse(zlib.gunzipSync(await get(PACKAGES_SITE + root.index.path)));
    console.log(`[packages] published index serial ${index.serial}, ${index.packages.length} packages: archive links checked against it, sizes shown`);
    return index;
  } catch (e) {
    console.warn(`[packages] WARNING: could not fetch the published index (${e.message}); archive links are made from the records, without sizes`);
    return null;
  }
}
const publishedIndex = await fetchIndex();

/** Reads one stored or deflated entry of a zip file, or null. */
function zipEntry(file, name) {
  const buf = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = buf.readUInt16LE(eocd + 10); n > 0; n--) {
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    if (buf.toString('utf8', p + 46, p + 46 + nlen) === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + csize);
      return method === 0 ? data : zlib.inflateRawSync(data);
    }
    p += 46 + nlen + elen + clen;
  }
  return null;
}

export { kindOf, formatSize };
export const slugOf = (id) => id; // IDs are dotted reverse-DNS names, safe in a URL

const fallbackName = (id) =>
  id.split('.').pop().split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

/**
 * The one place that decides a package's display name. Today the records carry none, so it is read from the
 * archive's library.json (as the published index does), else made from the id. When the index or the
 * records gain a name field, replace the body of this function and nothing else.
 * `archives` is the list of archive file paths of the package's versions, newest first.
 */
function displayName(id, archives) {
  for (const file of archives) {
    if (!fs.existsSync(file)) continue;
    try { const n = JSON.parse(zipEntry(file, 'library.json')).name; if (n) return n; } catch { /* try the next */ }
  }
  return fallbackName(id);
}

export function loadPackages(dir = PACKAGES_DIR) {
  const root = path.join(dir, 'packages');
  const publishers = {};
  const pdir = path.join(dir, 'publishers');
  if (fs.existsSync(pdir)) {
    for (const f of fs.readdirSync(pdir).filter((f) => f.endsWith('.json'))) {
      const p = JSON.parse(fs.readFileSync(path.join(pdir, f), 'utf8'));
      publishers[p.id] = p;
    }
  }
  const out = [];
  for (const id of fs.readdirSync(root).sort()) {
    const folder = path.join(root, id);
    if (!fs.statSync(folder).isDirectory()) continue;
    const versions = [];
    const archives = [];
    for (const f of fs.readdirSync(folder).filter((f) => f.endsWith('.json'))) {
      const r = JSON.parse(fs.readFileSync(path.join(folder, f), 'utf8'));
      if (r.format !== 'oscairn.repository-release') continue;
      const archiveFile = r.archive.path || (r.archive.url || '').split('/').pop();
      archives.push({ version: r.release, file: path.join(folder, archiveFile) });
      versions.push({
        version: r.release, publisher: r.publisher, channel: r.channel || 'stable', platforms: r.platforms || [],
        archive: { file: archiveFile, size: r.archive.size, sha256: r.archive.sha256 },
        source: r.source, yanked: r.yanked, summary: r.summary, license: r.license, tags: r.tags || [],
        dependencies: r.dependencies?.assets || [],
      });
    }
    if (!versions.length) continue;
    versions.sort((a, b) => compareVersions(b.version, a.version)); // newest first
    // Ready-made archives (packages README, "Downloading a package by hand"): one per version and platform,
    // or one for a package without builds. Listed only where the published index lists the platform (and the
    // archive is not marked noExport); sizes are the index's pieces: shared part + that platform's part.
    const published = publishedIndex?.packages.find((p) => p.id === id)?.versions;
    for (const v of versions) {
      const iv = published?.find((x) => x.version === v.version);
      const base = `${PACKAGES_SITE}exports/${id}/${v.version}/${id}-${v.version}`;
      const wanted = v.platforms.length ? v.platforms : [null];
      v.exports = [];
      for (const plat of wanted) {
        const entry = plat ? iv?.platforms?.[plat] : null;
        if (publishedIndex && (!iv || iv.noExport === true || (Array.isArray(iv.noExport) && plat && iv.noExport.includes(plat)) || (plat && !entry))) continue;
        v.exports.push({ platform: plat, url: `${base}${plat ? '-' + plat : ''}.olib/`, size: iv ? iv.common.size + (entry ? entry.size : 0) : null });
      }
    }
    const latest = versions[0];
    const order = new Map(versions.map((v, i) => [v.version, i]));
    archives.sort((a, b) => order.get(a.version) - order.get(b.version));
    out.push({
      id, name: displayName(id, archives.map((a) => a.file)), summary: latest.summary, license: latest.license,
      tags: latest.tags, kind: kindOf(latest.tags), latest: latest.version, versions,
      platforms: [...new Set(versions.flatMap((v) => v.platforms))].sort(),
      latestPlatforms: latest.platforms,
      publisher: publishers[latest.publisher] ? { id: latest.publisher, name: publishers[latest.publisher].name }
        : { id: latest.publisher, name: latest.publisher },
      source: latest.source,
    });
  }
  return out;
}
