// Link rewriting: run with `npm test` (needs the code repository's docs folder, see lib/config.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { markdownToHtml } from 'satteri';
import { DOCS_DIR } from '../lib/config.mjs';
import { docsLinks } from '../lib/docs.mjs';

const render = (md, rel = 'rfcs/0024-device-profiles.md') =>
  markdownToHtml(md, { mdastPlugins: [docsLinks()], fileURL: pathToFileURL(path.join(DOCS_DIR, rel)) }).html;

test('a link to a doc becomes the page URL, with its anchor', () => {
  assert.match(render('[a](../architecture.md#core-idea)'), /href="\/docs\/architecture\/#core-idea"/);
  assert.match(render('[a](0006-packages-and-portability.md)'), /href="\/docs\/rfcs\/0006-packages-and-portability\/"/);
});
test('README files are the section index', () => {
  assert.match(render('[a](README.md)'), /href="\/docs\/rfcs\/"/);
  assert.match(render('[a](../README.md)'), /href="\/docs\/"/);
});
test('a link title survives', () => {
  assert.match(render('[a](../roadmap.md "the roadmap")'), /href="\/docs\/roadmap\/" title="the roadmap"/);
});
test('files outside docs/ and non-Markdown files go to GitHub, directories to tree', () => {
  assert.match(render('[a](../../hosts/standalone/profiles)'), /href="https:\/\/github.com\/oscairn\/oscairn\/tree\/main\/hosts\/standalone\/profiles"/);
  assert.match(render('[a](../panel-map.schema.json)'), /href="https:\/\/github.com\/oscairn\/oscairn\/blob\/main\/docs\/panel-map.schema.json"/);
});
test('images under docs/images load from /docs-images/, in Markdown and in raw HTML', () => {
  assert.match(render('![x](../images/desktop/home.png)'), /src="\/docs-images\/desktop\/home.png"/);
  assert.match(render('<img src="../images/desktop/home.png" alt="x">'), /src="\/docs-images\/desktop\/home.png"/);
});
test('reference-style links are rewritten', () => {
  assert.match(render('[a][r]\n\n[r]: ../roadmap.md'), /href="\/docs\/roadmap\/"/);
});
test('code is never touched', () => {
  const html = render('`[a](../roadmap.md)`\n\n```md\n[a](../roadmap.md)\n```');
  assert.equal((html.match(/\.\.\/roadmap\.md/g) || []).length, 2);
});
test('external, anchor-only and site-absolute links stay', () => {
  const html = render('[a](https://example.com/x.md) [b](#here) [c](/docs/) [d](mailto:a@b.c)');
  for (const u of ['https://example.com/x.md', '#here', '/docs/', 'mailto:a@b.c']) assert.ok(html.includes(`href="${u}"`), u);
});
