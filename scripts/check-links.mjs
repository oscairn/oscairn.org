// Checks every internal link, image and anchor in dist/. Prints the count of broken ones and the first ten.
import fs from 'node:fs';
import path from 'node:path';
const dist = path.resolve(process.argv[2] || 'dist');
const htmlFiles = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) htmlFiles.push(p);
  }
})(dist);
const ids = new Map();
const pages = new Map();
for (const f of htmlFiles) {
  const html = fs.readFileSync(f, 'utf8');
  pages.set(f, html);
  ids.set(f, new Set([...html.matchAll(/\sid=["']?([^\s"'>]+)/g)].map((m) => m[1])));
}
const broken = [];
const external = new Map();
let total = 0;
const resolveFile = (p) => {
  for (const c of [p, p + '.html', path.join(p, 'index.html')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
};
for (const [file, html] of pages) {
  const base = '/' + path.relative(dist, path.dirname(file)).split(path.sep).join('/') + '/';
  for (const m of html.matchAll(/\s(?:href|src)=["']?([^\s"'>]+)/g)) {
    let u = m[1].replace(/&amp;/g, '&');
    if (/^https?:\/\//i.test(u)) { if (!/\/\/localhost|oscairn\.org\//.test(u) || /packages\.oscairn\.org\/exports\//.test(u)) external.set(u, (external.get(u) || 0) + 1); continue; }
    if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(u)) continue;
    total++;
    const [, p = '', frag = ''] = u.match(/^([^#?]*)(?:\?[^#]*)?(?:#(.*))?$/);
    const abs = p ? path.join(dist, decodeURI(p.startsWith('/') ? p : path.posix.join(base, p))) : file;
    const target = p ? resolveFile(abs) : file;
    if (!target) { broken.push(`${path.relative(dist, file)}: ${u} (no such file)`); continue; }
    if (frag && target.endsWith('.html') && !ids.get(target)?.has(decodeURIComponent(frag))) broken.push(`${path.relative(dist, file)}: ${u} (no such anchor)`);
  }
}
console.log(`links checked: ${total}, pages: ${pages.size}, broken: ${broken.length}`);
broken.slice(0, 10).forEach((b) => console.log('  ' + b));
// External links are counted, never fail the build. With --external the package archive links (packages.oscairn.org/exports/) are
// also asked with HEAD (following redirects); a failure there is a warning only.
const exportsLinks = [...external.keys()].filter((u) => u.includes('packages.oscairn.org/exports/'));
console.log(`external links: ${external.size} distinct (${[...external.values()].reduce((a, b) => a + b, 0)} uses), of which ${exportsLinks.length} package archive links`);
if (process.argv.includes('--external')) {
  let ok = 0; const bad = [];
  for (const u of exportsLinks) {
    try { const r = await fetch(u, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) }); r.ok ? ok++ : bad.push(`${u} -> ${r.status}`); }
    catch (e) { bad.push(`${u} -> ${e.message}`); }
  }
  console.log(`archive links answered: ${ok} ok, ${bad.length} not ok (warnings, not failures)`);
  bad.slice(0, 10).forEach((b) => console.log('  warning: ' + b));
}
process.exit(broken.length ? 1 : 0);
