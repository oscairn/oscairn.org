// Per-page weight, request count, no-JS readability and axe checks for dist/ (run from the site folder).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';

const dist = path.resolve('dist');
const gz = (b) => zlib.gzipSync(b, { level: 9 }).length;
const read = (f) => fs.readFileSync(f);

// The longest doc by HTML size.
let longest = null;
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name === 'index.html' && p.startsWith(path.join(dist, 'docs') + path.sep) && (!longest || fs.statSync(p).size > fs.statSync(longest).size)) longest = p;
  }
})(path.join(dist, 'docs'));
const pages = [['landing', path.join(dist, 'index.html')], ['longest doc', longest], ['packages listing', path.join(dist, 'packages/index.html')]];

const asset = (u) => path.join(dist, u.split('?')[0]);
for (const [name, file] of pages) {
  const html = read(file).toString('utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const d = dom.window.document;
  const css = [...d.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href')).filter((h) => h.startsWith('/'));
  const js = [...d.querySelectorAll('script[src]')].map((s) => s.getAttribute('src')).filter((h) => h.startsWith('/'));
  const pre = [...d.querySelectorAll('link[rel=modulepreload]')].map((l) => l.getAttribute('href'));
  const imgs = [...d.querySelectorAll('img[src]')].map((i) => i.getAttribute('src')).filter((h) => h.startsWith('/'));
  const inlineJs = [...d.querySelectorAll('script:not([src])')].map((s) => s.textContent).join('\n');
  const inlineCss = [...d.querySelectorAll('style')].map((s) => s.textContent).join('\n');
  const sum = (list) => list.reduce((a, u) => { const b = read(asset(u)); return [a[0] + b.length, a[1] + gz(b)]; }, [0, 0]);
  const [cr, cg] = sum(css), [jr, jg] = sum([...js, ...pre.filter((p) => !js.includes(p))]);
  // Fonts: woff2 files named by the page's CSS (browsers fetch one format per face; counted as all fetched, an upper bound).
  const cssText = css.map((u) => read(asset(u)).toString('utf8')).join('\n') + inlineCss;
  const fonts = [...new Set([...cssText.matchAll(/url\(["']?(\/[^)"']+\.woff2)/g)].map((m) => m[1]))];
  const fontBytes = fonts.reduce((a, u) => a + read(asset(u)).length, 0);
  const requests = fonts.length + 1 + css.length + js.length + pre.filter((p) => !js.includes(p)).length + imgs.length + (d.querySelector('link[rel=icon]') ? 1 : 0);
  const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]).filter((u) => d.querySelector(`link[rel~=stylesheet][href="${u}"],link[rel~=icon][href="${u}"],link[rel~=preload][href="${u}"],script[src="${u}"],img[src="${u}"]`));
  const main = (d.querySelector('main') || d.body).textContent.replace(/\s+/g, ' ').trim();
  const navLinks = [...d.querySelectorAll('nav a[href], .sidebar a[href]')].length;
  const out = {
    page: name, file: path.relative(dist, file),
    html: [html.length, gz(Buffer.from(html))],
    css_external: [cr, cg], css_inline: inlineCss.length, js_external: [jr, jg], js_inline: inlineJs.length,
    fonts_woff2: [fonts.length, fontBytes], requests_at_load: requests, external_requests: external.length,
    mainTextChars: main.length, navLinksInHtml: navLinks,
  };
  // axe in jsdom has no layout engine: color-contrast cannot run, so it is disabled.
  const win = dom.window;
  win.eval(axe.source);
  const r = await win.axe.run(win.document.documentElement, { rules: { 'color-contrast': { enabled: false } }, resultTypes: ['violations'] });
  out.axe_violations = r.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`);
  console.log(JSON.stringify(out));
}
