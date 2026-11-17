// Writes a synthetic package repository of N packages in the real index's shape (repository.json,
// index/<sha256>.json.gz and, with catalog=true, the proposed compact catalog), for tests and screenshots.
// Usage: node scripts/synthetic-index.mjs <dir> [N=10000] [--catalog]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

const hex = (n = 64) => crypto.randomBytes(n / 2).toString('hex');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const WORDS = ['Tidal', 'Granite', 'Ember', 'Harbor', 'Velvet', 'Quartz', 'Lumen', 'Cedar', 'Nimbus', 'Orbit', 'Fjord', 'Mosaic', 'Atlas', 'Prism', 'Copper', 'Willow', 'Static', 'Drift', 'Marble', 'Signal'];
const THINGS = ['Synth', 'Sampler', 'Delay', 'Reverb', 'Organ', 'Chorus', 'Arpeggiator', 'Sequencer', 'Cartridges', 'Drums', 'Strings', 'Pad', 'Bass', 'Keys', 'Filter'];
const KINDS = [['instrument', 'synthesizer'], ['audio-effect', 'delay'], ['note-effect', 'midi'], ['patches', 'synthesizer'], ['instrument', 'sampler']];
const PLATS = ['linux-arm64', 'linux-x86_64', 'macos-arm64', 'macos-x86_64', 'windows-x86_64'];

export function generate(dir, n = 10000, { catalog = false } = {}) {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const packages = [];
  for (let i = 0; i < n; i++) {
    const [kind, tag] = pick(KINDS);
    const name = `${pick(WORDS)} ${pick(THINGS)} ${i}`;
    const id = `com.example${i % 50}.${name.toLowerCase().replace(/ /g, '-')}`;
    const plats = kind === 'patches' ? [] : PLATS.filter(() => rnd() < 0.4).slice(0, 4);
    const nv = 1 + Math.floor(rnd() * 3);
    const versions = Array.from({ length: nv }, (_, k) => ({
      version: `${Math.floor(k / 3)}.${k % 3 + 1}.${Math.floor(rnd() * 9)}`, channel: 'stable',
      manifest: { sha256: hex(), size: 3000 + Math.floor(rnd() * 3000) }, pieces: { sha256: hex(), size: 700 + Math.floor(rnd() * 400) },
      packageSignature: true, requires: { packages: [] }, types: kind === 'patches' ? {} : { clap: 1 },
      platforms: Object.fromEntries((plats.length ? plats : []).map((p) => [p, { size: 100000 + Math.floor(rnd() * 5e6), installed: 300000 + Math.floor(rnd() * 8e6) }])),
      common: { size: 20000 + Math.floor(rnd() * 90000), installed: 50000 + Math.floor(rnd() * 200000) }, estimates: {}, yanked: null,
    }));
    packages.push({ id, name, summary: `A synthetic ${tag} package for testing the catalog at scale, number ${i}.`, publisher: { id: `com.example${i % 50}`, name: `Example ${i % 50}`, key: hex(16) }, license: pick(['MIT', 'AGPL-3.0-or-later', 'GPL-3.0-or-later AND MIT', 'BSD-2-Clause']), tags: [kind, tag], versions });
  }
  const index = { format: 'oscairn.repository-index', version: 1, repository: 'test.synthetic', serial: 1, packages };
  fs.mkdirSync(path.join(dir, 'index'), { recursive: true });
  const raw = Buffer.from(JSON.stringify(index)); const gz = zlib.gzipSync(raw, { mtime: 0 });
  const d = sha(gz);
  fs.writeFileSync(path.join(dir, 'index', `${d}.json.gz`), gz);
  const root = { format: 'oscairn.repository', version: 1, repository: 'test.synthetic', name: 'Synthetic', serial: 1, index: { path: `index/${d}.json.gz`, sha256: d, size: gz.length } };
  let catalogSizes = null;
  if (catalog) {
    const kindName = { instrument: 'Instrument', 'audio-effect': 'Effect', 'note-effect': 'Note effect', patches: 'Content' };
    const lines = [JSON.stringify({ format: 'oscairn.repository-catalog', version: 1, serial: 1 })].concat(packages.map((p) => JSON.stringify({
      id: p.id, name: p.name, kind: kindName[p.tags[0]], latest: p.versions[p.versions.length - 1].version, platforms: Object.keys(p.versions[p.versions.length - 1].platforms),
      license: p.license, summary: p.summary, tags: p.tags, publisher: p.publisher.name, updated: '2026-11-07' })));
    const craw = Buffer.from(lines.join('\n') + '\n'); const cgz = zlib.gzipSync(craw, { mtime: 0 }); const cd = sha(cgz);
    fs.mkdirSync(path.join(dir, 'catalog'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'catalog', `${cd}.ndjson.gz`), cgz);
    root.catalog = { path: `catalog/${cd}.ndjson.gz`, sha256: cd, size: cgz.length };
    catalogSizes = [craw.length, cgz.length];
  }
  fs.writeFileSync(path.join(dir, 'repository.json'), JSON.stringify(root));
  return { raw: raw.length, gzip: gz.length, catalog: catalogSizes };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const dir = process.argv[2]; const n = Number(process.argv[3]) || 10000;
  console.log(n, generate(dir, n, { catalog: process.argv.includes('--catalog') }));
}
