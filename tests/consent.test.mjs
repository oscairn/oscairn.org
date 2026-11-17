// The consent banner (lib/consent.mjs) in a browser: Google Tag Manager is requested only after Accept.
// Skipped where Playwright's Chromium is not installed (the Pages workflow does not install it).
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { CONSENT_SCRIPT, CONSENT_STYLE } from '../lib/consent.mjs';

const URL_ = 'http://consent.test/';
const page_html = `<!doctype html><html><head><script>${CONSENT_SCRIPT}</script><style>${CONSENT_STYLE}</style></head><body><main>x</main><button data-consent-open>Cookie settings</button></body></html>`;

let browser;
try { browser = await chromium.launch(); } catch { /* no browser */ }

async function visit(ctx, requests) {
  const page = await ctx.newPage();
  await page.route('**/*', (route) => {
    const u = route.request().url();
    if (u.includes('googletagmanager.com')) { requests.push(u); return route.fulfill({ contentType: 'text/javascript', body: '' }); }
    return route.fulfill({ contentType: 'text/html', body: page_html });
  });
  await page.goto(URL_);
  return page;
}
const banner = (page) => page.getByRole('region', { name: 'Analytics consent' });

test('a fresh visitor sees the banner and nothing is requested from Google', { skip: !browser }, async () => {
  const ctx = await browser.newContext(), req = [];
  const page = await visit(ctx, req);
  await banner(page).waitFor();
  await page.waitForTimeout(300);
  assert.deepEqual(req, []);
  await ctx.close();
});

test('Accept loads Google Tag Manager, and the banner stays gone on the next load', { skip: !browser }, async () => {
  const ctx = await browser.newContext(), req = [];
  const page = await visit(ctx, req);
  await banner(page).getByRole('button', { name: 'Accept' }).click();
  await page.waitForTimeout(300);
  assert.equal(await banner(page).count(), 0);
  assert.ok(req.some((u) => u.includes('googletagmanager.com/gtm.js?id=GTM-TWWBF9GJ')), req.join());
  req.length = 0;
  await page.reload();
  await page.waitForTimeout(300);
  assert.equal(await banner(page).count(), 0);
  assert.ok(req.some((u) => u.includes('gtm.js?id=GTM-TWWBF9GJ')), 'loads at once when granted');
  await ctx.close();
});

test('Decline never loads it, and the banner stays gone; the link brings it back', { skip: !browser }, async () => {
  const ctx = await browser.newContext(), req = [];
  const page = await visit(ctx, req);
  await banner(page).getByRole('button', { name: 'Decline' }).click();
  await page.reload();
  await page.waitForTimeout(300);
  assert.equal(await banner(page).count(), 0);
  assert.deepEqual(req, []);
  await page.getByText('Cookie settings').click();
  await banner(page).waitFor();
  await ctx.close();
});

test('Global Privacy Control counts as declined: no banner, no request', { skip: !browser }, async () => {
  const ctx = await browser.newContext(), req = [];
  await ctx.addInitScript(() => Object.defineProperty(navigator, 'globalPrivacyControl', { value: true }));
  const page = await visit(ctx, req);
  await page.waitForTimeout(300);
  assert.equal(await banner(page).count(), 0);
  assert.deepEqual(req, []);
  await ctx.close();
});

test.after(() => browser?.close());
