// Serves dist/ on 127.0.0.1 and captures full-page screenshots into shots/ (git-ignored), plus layout checks.
// Usage: node scripts/shots.mjs [outDir]    (needs `npm ci`, `npx playwright install chromium` and a built dist/)
// Output: <outDir>/<page>-<WxH>-<light|dark>.png, phone-*.png for the open menu, sidebar and search, and a printed
// list of problems (horizontal scroll, tap targets under 44 px in the header, header controls that overlap).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const dist = path.resolve('dist');
const out = path.resolve(process.argv[2] || 'shots');
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (f.endsWith('.png')) fs.rmSync(path.join(out, f));

const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.avif': 'image/avif', '.webp': 'image/webp' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(dist, p);
  if (!f.startsWith(dist)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { f = path.join(dist, '404.html'); res.statusCode = 404; }
  res.setHeader('content-type', types[path.extname(f)] || 'application/octet-stream');
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// The longest RFC by HTML size.
let longest = ''; let max = 0;
for (const d of fs.readdirSync(path.join(dist, 'docs/rfcs'), { withFileTypes: true })) {
  const f = path.join(dist, 'docs/rfcs', d.name, 'index.html');
  if (d.isDirectory() && fs.existsSync(f) && fs.statSync(f).size > max) { max = fs.statSync(f).size; longest = d.name; }
}
const pages = {
  landing: '/', guide: '/docs/developer-guide/', rfc: `/docs/rfcs/${longest}/`, packages: '/packages/',
  package: '/packages/org.oscairn.sampler/', devices: '/devices/', '404': '/nope/',
};
const sizes = [[390, 844], [768, 1024], [1280, 800]];
const phones = [[360, 740], [430, 932]]; // extra phone widths: header only, on the landing and a docs page
const problems = [];
const browser = await chromium.launch();

async function check(page, label, w) {
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const header = document.querySelector('header');
    const box = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
    const targets = header ? [...header.querySelectorAll('a, button')].filter((e) => e.offsetParent !== null).map((e) => ({ t: (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 24), ...box(e) })) : [];
    return { sw: doc.scrollWidth, iw: window.innerWidth, targets, header: header ? box(header) : null };
  });
  if (r.sw > r.iw) problems.push(`${label}: horizontal scroll (${r.sw} > ${r.iw})`);
  if (w <= 500) {
    for (const t of r.targets) if (t.h < 44 || t.w < 44) problems.push(`${label}: header target "${t.t}" is ${Math.round(t.w)}x${Math.round(t.h)}`);
    for (let i = 0; i < r.targets.length; i++) for (let j = i + 1; j < r.targets.length; j++) {
      const a = r.targets[i], b = r.targets[j];
      if (a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1) problems.push(`${label}: header "${a.t}" overlaps "${b.t}"`);
    }
    if (r.header) for (const t of r.targets) if (t.r > r.iw + 1 || t.x < -1) problems.push(`${label}: header target "${t.t}" outside the viewport`);
  }
}

for (const scheme of ['light', 'dark']) {
  for (const [w, h] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
    for (const [name, url] of Object.entries(pages)) {
      const page = await ctx.newPage();
      await page.goto(base + url, { waitUntil: 'networkidle' });
      await check(page, `${name} ${w}x${h} ${scheme}`, w);
      await page.screenshot({ path: path.join(out, `${name}-${w}x${h}-${scheme}.png`), fullPage: true });
      if (w < 500) await page.screenshot({ path: path.join(out, `${name}-${w}x${h}-${scheme}-top.png`) }); // the first screen, readable at full size
      await page.close();
    }
    await ctx.close();
  }
}

for (const [w, h] of phones) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: 'dark', hasTouch: true, isMobile: true });
  for (const [name, url] of [['landing', '/'], ['guide', '/docs/developer-guide/']]) {
    const page = await ctx.newPage();
    await page.goto(base + url, { waitUntil: 'networkidle' });
    await check(page, `${name} ${w}x${h}`, w);
    const hh = await page.evaluate(() => document.querySelector('header').getBoundingClientRect().height);
    if (hh > 70) problems.push(`${name} ${w}: header is ${Math.round(hh)} px tall (more than one row)`);
    await page.screenshot({ path: path.join(out, `${name}-${w}x${h}-dark-top.png`) });
    await page.close();
  }
  await ctx.close();
}
// Phone states: menu open, docs sidebar open, search open, and the theme button.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light', hasTouch: true, isMobile: true });
  for (const [name, url] of [['landing', '/'], ['guide', '/docs/developer-guide/'], ['packages', '/packages/']]) {
    const page = await ctx.newPage();
    await page.goto(base + url, { waitUntil: 'networkidle' });
    const menu = page.locator('[data-menu-button]');
    if (await menu.count()) {
      await menu.first().click();
      await page.waitForTimeout(200);
      const expanded = await menu.first().getAttribute('aria-expanded');
      if (expanded !== 'true') problems.push(`${name}: menu button aria-expanded is ${expanded} after opening`);
      await page.screenshot({ path: path.join(out, `phone-menu-open-${name}.png`) });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      if ((await menu.first().getAttribute('aria-expanded')) !== 'false') problems.push(`${name}: Escape did not close the menu`);
      if (!(await menu.first().evaluate((el) => el === document.activeElement))) problems.push(`${name}: focus did not return to the menu button`);
    } else problems.push(`${name}: no [data-menu-button] on the page`);
    await page.close();
  }
  {
    const page = await ctx.newPage();
    await page.goto(base + '/docs/developer-guide/', { waitUntil: 'networkidle' });
    const s = page.locator('site-search button[data-open-modal]');
    if (await s.count()) { await s.first().click(); await page.waitForTimeout(500); await page.keyboard.type('sound context'); await page.waitForTimeout(1200); await page.screenshot({ path: path.join(out, 'phone-search-open.png') }); }
    else problems.push('docs: no search button');
    await page.close();
  }
  // The theme button: one click flips the theme on the landing page and on a docs page.
  for (const [name, url] of [['landing', '/'], ['guide', '/docs/developer-guide/']]) {
    const page = await ctx.newPage();
    await page.goto(base + url, { waitUntil: 'networkidle' });
    const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const btn = page.locator('.themebtn:visible').first();
    if (!(await btn.count())) { problems.push(`${name}: no visible theme button on the phone`); await page.close(); continue; }
    await btn.click(); await page.waitForTimeout(200);
    const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    if (before === after) problems.push(`${name}: theme button changed nothing`);
    await page.screenshot({ path: path.join(out, `phone-theme-clicked-${name}.png`) });
    await page.close();
  }
  await ctx.close();
}
await browser.close();
server.close();
console.log(problems.length ? `problems (${problems.length}):\n  ` + problems.join('\n  ') : 'no problems found');
console.log(`screenshots in ${out}`);
