// Pure helpers shared by the build (lib/packages.mjs), the browser scripts and the tests: kinds, version order,
// sizes, turning the published index (or a compact catalog) into entries, and searching them.

// What a package is, from its tags (neither the records nor the index carry a kind).
const KINDS = [['instrument', 'Instrument'], ['audio-effect', 'Effect'], ['note-effect', 'Note effect'], ['patches', 'Content']];
export const kindOf = (tags = []) => (KINDS.find(([t]) => tags.includes(t)) || [null, 'Other'])[1];

const versionKey = (v) => String(v).split(/[.+-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
export function compareVersions(a, b) {
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

export function formatSize(n) {
  if (n >= 1 << 20) return (n / (1 << 20)).toFixed(1) + ' MiB';
  if (n >= 1 << 10) return (n / (1 << 10)).toFixed(1) + ' KiB';
  return n + ' B';
}

/** The address of a version's ready-made archive (packages README, "Downloading a package by hand"). */
export const archiveUrl = (site, id, version, platform) =>
  `${site}exports/${id}/${version}/${id}-${version}${platform ? '-' + platform : ''}.olib/`;

/** One entry from a package of the published index (repository.json -> index/<sha256>.json.gz). */
export function entryFromIndex(p, site) {
  const versions = [...p.versions].sort((a, b) => compareVersions(b.version, a.version)).map((v) => {
    const platforms = Object.keys(v.platforms || {}).sort();
    const links = [];
    for (const plat of platforms.length ? platforms : [null]) {
      if (v.noExport === true || (Array.isArray(v.noExport) && plat && v.noExport.includes(plat))) continue;
      const size = (v.common?.size ?? 0) + (plat ? v.platforms[plat].size : 0);
      links.push({ platform: plat, url: archiveUrl(site, p.id, v.version, plat), size: size || null });
    }
    return { version: v.version, channel: v.channel || 'stable', platforms, yanked: v.yanked || null, links, requires: v.requires?.packages || [], types: v.types || {} };
  });
  return {
    id: p.id, name: p.name, summary: p.summary || '', tags: p.tags || [], license: p.license || '', kind: kindOf(p.tags),
    publisher: p.publisher ? { id: p.publisher.id, name: p.publisher.name } : { id: '', name: '' },
    latest: versions[0]?.version || '', platforms: [...new Set(versions.flatMap((v) => v.platforms))].sort(), versions,
  };
}
export const entriesFromIndex = (index, site) => index.packages.map((p) => entryFromIndex(p, site));

/** A line of the compact catalog (see REPORT.md, "What the packages repository should publish"). */
export function entryFromCatalogLine(l) {
  return { id: l.id, name: l.name, summary: l.summary || '', tags: l.tags || [], license: l.license || '', kind: l.kind || kindOf(l.tags),
    publisher: { id: '', name: l.publisher || '' }, latest: l.latest || '', platforms: l.platforms || [], versions: null };
}

/** Filter and sort entries. `q` words must all appear in name, id, summary or tags. */
export function search(entries, { q = '', kind = '', platform = '', sort = 'name' } = {}) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  for (const e of entries) {
    if (kind && e.kind !== kind) continue;
    if (platform && !(platform === 'any' ? e.platforms.length === 0 : e.platforms.includes(platform))) continue;
    if (words.length) {
      const h = (e._h ??= `${e.name} ${e.id} ${e.summary} ${e.tags.join(' ')}`.toLowerCase());
      if (!words.every((w) => h.includes(w))) continue;
    }
    out.push(e);
  }
  const by = { name: (a, b) => a.name.localeCompare(b.name), id: (a, b) => a.id.localeCompare(b.id), kind: (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) }[sort] || ((a, b) => 0);
  return out.sort(by);
}

export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
