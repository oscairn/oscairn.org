// Reads the docs folder in place: lists the Markdown files, derives titles from the first
// heading, rewrites relative links and image paths, and loads them as a content collection.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DOCS_DIR, GITHUB, GITHUB_BRANCH, IMAGE_BASE } from './config.mjs';

/** Docs that are not published (internal work orders), as paths relative to DOCS_DIR. */
export const EXCLUDED_DOCS = new Set(['packages-repository-changes.md']);

/** Every .md file under DOCS_DIR (except EXCLUDED_DOCS) as paths relative to it, with "/" separators. */
export function listDocs(dir = DOCS_DIR) {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) {
        const rel = path.relative(dir, p).split(path.sep).join('/');
        if (!EXCLUDED_DOCS.has(rel)) out.push(rel);
      }
    }
  };
  walk(dir);
  return out.sort();
}

/** "rfcs/0001-x.md" -> "docs/rfcs/0001-x"; "README.md" -> "docs", "rfcs/README.md" -> "docs/rfcs". */
export function entryId(rel) {
  let id = rel.replace(/\.md$/, '');
  id = id.replace(/(^|\/)README$/, '');
  return ['docs', id].filter(Boolean).join('/');
}
export const pageUrl = (rel) => '/' + entryId(rel) + '/';

const FENCE = /^\s{0,3}(```+|~~~+)/;

/** First "# Heading" outside code fences, and the text without that line. */
export function splitTitle(text, fallback) {
  const lines = text.split('\n');
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const f = lines[i].match(FENCE);
    if (f) { fence = fence ? (lines[i].trim().startsWith(fence[0][0]) ? null : fence) : f[1]; continue; }
    if (fence) continue;
    const m = lines[i].match(/^#\s+(.+?)\s*#*\s*$/);
    if (m) {
      lines.splice(i, 1);
      return { title: m[1].replace(/`/g, ''), body: lines.join('\n') };
    }
  }
  return { title: fallback, body: text };
}

export const titleOf = (rel, dir = DOCS_DIR) =>
  splitTitle(fs.readFileSync(path.join(dir, rel), 'utf8'), rel).title;

const IMG_EXT = /\.(png|jpe?g|gif|svg|webp)$/i;

/** Where a link written in the file `rel` (relative to DOCS_DIR) should point on the site. */
export function rewriteUrl(url, rel, known, dir = DOCS_DIR) {
  if (/^([a-z][a-z0-9+.-]*:|\/|#)/i.test(url)) return url; // absolute, site-absolute, mailto:, anchor
  const m = url.match(/^([^#?]*)([?#].*)?$/);
  const target = decodeURI(m[1]);
  const tail = m[2] || '';
  if (!target) return url;
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(rel), target)); // relative to docs/
  const inDocs = !resolved.startsWith('..');
  if (inDocs && known.has(resolved)) return pageUrl(resolved) + tail.replace(/^\?[^#]*/, '');
  // Images under docs/images are copied to IMAGE_BASE at build (astro.config.mjs).
  if (resolved.startsWith('images/') && IMG_EXT.test(resolved) && fs.existsSync(path.join(dir, resolved))) return IMAGE_BASE + resolved.slice('images/'.length);
  // Anything else (schemas, source files, directories) lives in the code repository: link to GitHub.
  const repoPath = path.posix.normalize(path.posix.join('docs', resolved)).replace(/\/$/, '');
  if (repoPath.startsWith('..')) return url;
  const abs = path.join(dir, '..', repoPath);
  const kind = fs.existsSync(abs) && fs.statSync(abs).isDirectory() ? 'tree' : 'blob';
  return `${GITHUB}/${kind}/${GITHUB_BRANCH}/${repoPath}${tail}`;
}

const RAW_ATTR = /(\s(?:src|href)=")([^"]+)(")/g;

/**
 * An mdast plugin for the Astro 7 markdown pipeline (satteri): rewrites links, images, reference
 * definitions and raw src/href attributes in the Markdown syntax tree, so code is never touched.
 * It needs the file's path, which the loader passes as `fileURL` to renderMarkdown.
 */
export function docsLinks(dir = DOCS_DIR) {
  let known;
  return (ctx) => {
    if (!ctx.fileURL || !ctx.fileURL.pathname.startsWith(pathToFileURL(dir).pathname + '/')) return null;
    known ??= new Set(listDocs(dir));
    const rel = path.relative(dir, fileURLToPath(ctx.fileURL)).split(path.sep).join('/');
    const fix = (u) => rewriteUrl(u, rel, known, dir);
    return {
      name: 'oscairn-docs-links',
      link: (node, c) => c.setProperty(node, 'url', fix(node.url)),
      image: (node, c) => c.setProperty(node, 'url', fix(node.url)),
      definition: (node, c) => c.setProperty(node, 'url', fix(node.url)),
      html: (node, c) => c.setProperty(node, 'value', node.value.replace(RAW_ATTR, (_, a, u, z) => a + fix(u) + z)),
    };
  };
}

/** GFM task-list boxes come out as unlabeled inputs; give each a name for screen readers. */
function labelCheckboxes(r) {
  r.html = r.html.replace(/<input ([^>]*type="checkbox"[^>]*)>/g, (m, attrs) =>
    /aria-label/.test(attrs) ? m : `<input ${attrs} aria-label="${/\bchecked\b/.test(attrs) ? 'done' : 'not done'}">`);
  return r;
}

/** Content collection loader: one entry per Markdown file, no front matter needed. */
export function docsLoader() {
  return {
    name: 'oscairn-docs',
    async load({ store, renderMarkdown, watcher, logger, parseData }) {
      const files = listDocs();
            store.clear();
      for (const rel of files) {
        const raw = fs.readFileSync(path.join(DOCS_DIR, rel), 'utf8');
        const { title, body } = splitTitle(raw, rel);
        const id = entryId(rel);
        const data = await parseData({
          id,
          data: {
            title,
            editUrl: `${GITHUB}/edit/${GITHUB_BRANCH}/docs/${rel}`,
            ...(rel === 'README.md' ? { sidebar: { label: 'Overview' } } : {}),
          },
        });
        const fileURL = pathToFileURL(path.join(DOCS_DIR, rel));
        store.set({ id, data, body, rendered: labelCheckboxes(await renderMarkdown(body, { fileURL })) });
      }
      // Starlight's 404 page reads a docs entry with this id; the docs folder has none, so the site supplies a draft one (a draft is not routed as a page).
      const notFound = { title: 'Page not found', draft: true, editUrl: false, tableOfContents: false };
      store.set({ id: '404', data: await parseData({ id: '404', data: notFound }),
        body: 'There is nothing at this address. Try the [docs](/docs/), the [packages](/packages/) or the [start page](/).',
        rendered: await renderMarkdown('There is nothing at this address. Try the [docs](/docs/), the [packages](/packages/) or the [start page](/).') });
      logger.info(`${files.length} docs read from ${DOCS_DIR}`);
      watcher?.add(DOCS_DIR);
    },
  };
}
