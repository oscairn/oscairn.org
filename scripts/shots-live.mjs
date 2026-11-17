// The live package table and the package view page, checked in a browser: real index, synthetic 10,000-package
// repositories (full index and compact catalog), a failing fetch and JavaScript off. Screenshots go to shots/live-*.png.
// Usage: node scripts/shots-live.mjs   (needs dist/, network for the "real" case)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from '@playwright/test';
import { generate } from './synthetic-index.mjs';

const dist = path.resolve('dist'), out = path.resolve('shots'), syn = path.join(out, '.synthetic');
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (f.startsWith('live-') && f.endsWith('.png')) fs.rmSync(path.join(out, f));
fs.rmSync(syn, { recursive: true, force: true });
const sizes = { idx10k: generate(path.join(syn, 'idx10k'), 10000), cat10k: generate(path.join(syn, 'cat10k'), 10000, { catalog: true }) };
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.gz': 'application/gzip' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  res.setHeader('access-control-allow-origin', '*');
  let f = p.startsWith('/__syn/') ? path.join(syn, p.slice(7)) : path.join(dist, p);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.statusCode = 404; f = path.join(dist, '404.html'); }
  res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream');
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const problems = [], report = [];
const synId = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(syn, 'idx10k', JSON.parse(fs.readFileSync(path.join(syn, 'idx10k/repository.json'))).index.path)))).packages[7].id;
const browser = await chromium.launch();
const views = { phone: { width: 390, height: 844, isMobile: true, hasTouch: true }, desktop: { width: 1280, height: 800 } };

async function open(ctx, url, wait = true) {
  const page = await ctx.newPage();
  await page.goto(base + url, { waitUntil: 'networkidle' });
  if (wait) await page.waitForFunction(() => document.getElementById('pkg-app')?.dataset.live, null, { timeout: 30000 });
  return page;
}
const rows = (page) => page.locator('#pkg-body tr').count();

for (const scheme of ['light', 'dark']) {
  for (const [vn, v] of Object.entries(views)) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: v.isMobile, hasTouch: v.hasTouch, colorScheme: scheme });
    const shot = (page, n, full = false) => page.screenshot({ path: path.join(out, `live-${n}-${vn}-${scheme}.png`), fullPage: full });
    // 1. the real repository
    let page = await open(ctx, '/packages/');
    if ((await page.locator('#pkg-app').getAttribute('data-live')) !== 'index') problems.push(`real ${vn} ${scheme}: not read live (${await page.locator('#pkg-app').getAttribute('data-live')})`);
    report.push(`real ${vn} ${scheme}: ${await page.locator('#count').textContent()} | ${await page.locator('#pkg-status').textContent()}`.slice(0, 260));
    await shot(page, 'real');
    await page.close();
    // 2./3. synthetic 10,000: index only, and with the compact catalog
    for (const name of ['idx10k', 'cat10k']) {
      page = await open(ctx, `/packages/?repo=${encodeURIComponent(`${base}/__syn/${name}/`)}`);
      const n = await rows(page);
      if (n > 50) problems.push(`${name} ${vn}: ${n} rows in the DOM (more than one page)`);
      if ((await page.locator('#pkg-app').getAttribute('data-live')) !== (name === 'cat10k' ? 'catalog' : 'index')) problems.push(`${name} ${vn}: wrong source ${await page.locator('#pkg-app').getAttribute('data-live')}`);
      await shot(page, name);
      if (scheme === 'light') {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        const t = async (label, act, waitForCount = true) => {
          const before = await page.locator('#count').textContent();
          const t0 = Date.now();
          await act();
          if (waitForCount) await page.waitForFunction((b) => document.getElementById('count').textContent !== b, before, { timeout: 15000 }); else await page.waitForTimeout(300);
          const wall = Date.now() - t0;
          const inner = await page.locator('#pkg-app').getAttribute('data-last-ms');
          report.push(`${name} ${vn} 4x CPU throttle, ${label}: ${wall} ms wall (includes the 120 ms debounce for typing), filter+render ${inner} ms, ${await rows(page)} rows in DOM, "${(await page.locator('#count').textContent()).slice(0, 70)}"`);
        };
        await t('type "granite"', () => page.fill('#q', 'granite'));
        await shot(page, `${name}-filtered`);
        await t('type "granite synth 99"', () => page.fill('#q', 'granite synth 99'));
        await t('clear text', () => page.fill('#q', ''));
        await t('kind = Effect', () => page.selectOption('#kind', 'Effect'));
        await t('platform = macos-arm64', () => page.selectOption('#platform', 'macos-arm64'));
        await t('sort by ID', () => page.selectOption('#sort', 'id'), false);
        const url = page.url();
        if (!/kind=Effect/.test(url) || !/platform=macos-arm64/.test(url)) problems.push(`${name} ${vn}: the URL does not carry the filter (${url})`);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
        if (await page.locator('#more').isVisible()) { await page.locator('#more').click(); const m = await rows(page); if (m !== 100) problems.push(`${name} ${vn}: Show more gave ${m} rows`); }
        // A shared link restores the state.
        const p2 = await ctx.newPage(); await p2.goto(url, { waitUntil: 'networkidle' }); await p2.waitForFunction(() => document.getElementById('pkg-app').dataset.live);
        if ((await p2.locator('#kind').inputValue()) !== 'Effect') problems.push(`${name} ${vn}: a link did not restore the kind filter`);
        await p2.close();
      }
      await page.close();
    }
    // 4. the repository cannot be read
    {
      const p = await ctx.newPage();
      await p.route('**/repository.json', (r) => r.abort());
      await p.goto(base + '/packages/', { waitUntil: 'networkidle' });
      await p.waitForFunction(() => document.getElementById('pkg-app').dataset.live);
      if ((await p.locator('#pkg-app').getAttribute('data-live')) !== 'failed' || (await rows(p)) < 1) problems.push(`offline ${vn}: no fallback table`);
      report.push(`offline ${vn} ${scheme}: ${await p.locator('#pkg-status').textContent()}`);
      await shot(p, 'offline'); await p.close();
    }
    // 6. the view page, for a synthetic package and for the real index's newest
    {
      const p = await ctx.newPage();
      await p.goto(base + `/packages/view/?id=${encodeURIComponent(synId)}&repo=${encodeURIComponent(`${base}/__syn/idx10k/`)}`, { waitUntil: 'networkidle' });
      await p.waitForTimeout(1500);
      const h1 = await p.locator('h1').textContent();
      report.push(`view (synthetic) ${vn} ${scheme}: h1 "${h1}"`);
      if (h1 === 'Package') problems.push(`view ${vn}: synthetic package not shown (${await p.locator('#v-msg').textContent()})`);
      await shot(p, 'view'); await p.close();
    }
    await ctx.close();
  }
}
// Load time of the live data with the CPU throttled 4x: navigation start until the table shows the live repository.
for (const name of ['idx10k', 'cat10k']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  await page.goto(base + `/packages/?repo=${encodeURIComponent(`${base}/__syn/${name}/`)}`, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.getElementById('pkg-app')?.dataset.live, null, { timeout: 60000 });
  report.push(`load ${name} (phone, 4x CPU throttle, local network): ${Date.now() - t0} ms from navigation to live table`);
  await ctx.close();
}
// 5. JavaScript off
for (const [vn, v] of Object.entries(views)) {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, javaScriptEnabled: false, isMobile: v.isMobile });
  const p = await ctx.newPage(); await p.goto(base + '/packages/', { waitUntil: 'load' });
  const n = await rows(p);
  report.push(`no JavaScript ${vn}: ${n} rows from the build, filter hidden: ${await p.locator('#filter').isHidden()}`);
  if (n < 1) problems.push(`no-JS ${vn}: no rows`);
  await p.screenshot({ path: path.join(out, `live-nojs-${vn}.png`), fullPage: false });
  await ctx.close();
}
await browser.close(); server.close();
report.forEach((r) => console.log(r));
console.log('synthetic index sizes (bytes):', JSON.stringify(sizes));
console.log(problems.length ? `problems (${problems.length}):\n  ` + problems.join('\n  ') : 'no problems found');
