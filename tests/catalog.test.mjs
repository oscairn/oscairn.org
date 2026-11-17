// The shared catalog code and the repository reader, against a synthetic repository served locally.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generate } from '../scripts/synthetic-index.mjs';
import { search, compareVersions, kindOf, entriesFromIndex, escapeHtml } from '../lib/catalog.mjs';
import { fetchRepository, fetchPackage } from '../lib/repo-client.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'syn-'));
generate(path.join(dir, 'idx'), 300);
generate(path.join(dir, 'cat'), 300, { catalog: true });
const server = http.createServer((req, res) => {
  const f = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; res.end(); return; }
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const site = (n) => `http://127.0.0.1:${server.address().port}/${n}/`;
test.after(() => server.close());

test('version order is numeric', () => {
  assert.ok(compareVersions('0.4.10', '0.4.9') > 0);
  assert.ok(compareVersions('1.0.0', '1.0') > 0);
});
test('kind comes from tags', () => {
  assert.equal(kindOf(['instrument', 'sampler']), 'Instrument');
  assert.equal(kindOf(['patches']), 'Content');
  assert.equal(kindOf([]), 'Other');
});
test('the full index is read and turned into entries', async () => {
  const r = await fetchRepository(site('idx'));
  assert.equal(r.via, 'index');
  assert.equal(r.entries.length, 300);
  const e = r.entries[0];
  assert.ok(e.versions.length >= 1 && e.latest === e.versions[0].version);
  for (const l of e.versions[0].links) assert.match(l.url, /\/exports\/.+\.olib\/$/);
});
test('the compact catalog is preferred when the repository names one', async () => {
  const r = await fetchRepository(site('cat'));
  assert.equal(r.via, 'catalog');
  assert.equal(r.entries.length, 300);
  assert.equal(r.entries[0].versions, null);
});
test('one package is read from the index', async () => {
  const r = await fetchRepository(site('idx'));
  const { entry } = await fetchPackage(site('idx'), r.entries[5].id);
  assert.equal(entry.id, r.entries[5].id);
  assert.equal((await fetchPackage(site('idx'), 'no.such-package')).entry, null);
});
test('a missing repository is an error, not a hang', async () => {
  await assert.rejects(fetchRepository(site('nothing'), { timeout: 2000 }));
});
test('search: words, kind, platform, sort', async () => {
  const { entries } = await fetchRepository(site('idx'));
  const all = search(entries, {});
  assert.equal(all.length, 300);
  assert.deepEqual(all.map((e) => e.name), [...all.map((e) => e.name)].sort((a, b) => a.localeCompare(b)));
  const one = search(entries, { q: entries[3].name.toUpperCase() });
  assert.ok(one.some((e) => e.id === entries[3].id));
  assert.ok(search(entries, { kind: 'Effect' }).every((e) => e.kind === 'Effect'));
  assert.ok(search(entries, { platform: 'macos-arm64' }).every((e) => e.platforms.includes('macos-arm64')));
  assert.ok(search(entries, { platform: 'any' }).every((e) => e.platforms.length === 0));
  assert.equal(search(entries, { q: 'zzzz-no-match' }).length, 0);
});
test('escapeHtml', () => assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;'));
