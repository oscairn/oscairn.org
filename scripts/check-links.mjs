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
let total = 0;
const resolveFile = (p) => {
  for (const c of [p, p + '.html', path.join(p, 'index.html')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
};
for (const [file, html] of pages) {
  const base = '/' + path.relative(dist, path.dirname(file)).split(path.sep).join('/') + '/';
  for (const m of html.matchAll(/\s(?:href|src)=["']?([^\s"'>]+)/g)) {
    let u = m[1].replace(/&amp;/g, '&');
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
process.exit(broken.length ? 1 : 0);
