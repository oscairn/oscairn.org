// Builds the package catalog from the package repository's records
// (packages/<id>/<version>.json). The published index adds each package's name from the
// archive's library.json, so this reads that file from the .olib (a zip) the same way.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { PACKAGES_DIR } from './config.mjs';

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

const versionKey = (v) => v.split(/[.+-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
function compareVersions(a, b) {
  const x = versionKey(a), y = versionKey(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === y[i]) continue;
    if (x[i] === undefined) return -1;
    if (y[i] === undefined) return 1;
    if (typeof x[i] === 'number' && typeof y[i] === 'number') return x[i] - y[i];
    return String(x[i]) < String(y[i]) ? -1 : 1;
  }
  return 0;
}

// What a package is, from its tags (the records carry no kind of their own).
const KINDS = [
  ['instrument', 'Instrument'],
  ['audio-effect', 'Effect'],
  ['note-effect', 'Note effect'],
  ['patches', 'Content'],
];
export const kindOf = (tags) => (KINDS.find(([t]) => tags.includes(t)) || [null, 'Other'])[1];
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
        version: r.release, channel: r.channel || 'stable', platforms: r.platforms || [],
        archive: { file: archiveFile, size: r.archive.size, sha256: r.archive.sha256 },
        source: r.source, yanked: r.yanked, summary: r.summary, license: r.license, tags: r.tags || [],
        dependencies: r.dependencies?.assets || [],
      });
    }
    if (!versions.length) continue;
    versions.sort((a, b) => compareVersions(b.version, a.version)); // newest first
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

export function formatSize(n) {
  if (n >= 1 << 20) return (n / (1 << 20)).toFixed(1) + ' MiB';
  if (n >= 1 << 10) return (n / (1 << 10)).toFixed(1) + ' KiB';
  return n + ' B';
}
