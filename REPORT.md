# Oscairn site, Astro + Starlight build

## Second round (after the owner chose this build)

- Lives in `oscairn.org/` on the local branch `site` (clone of github.com/oscairn/oscairn.org; nothing pushed). Output carries `.well-known/oscairn-publisher.json` (sha256 7999d808...608b23, same as `main`), `.nojekyll` and `CNAME`; `scripts/check-identity.mjs` runs after every `npm run build` and fails it on any difference. DEPLOY.md has the switch and rollback; `.github/workflows/pages.yml` is manual-only until then.
- Theme button is an icon (inline SVG sun/moon, aria-label that follows the state, visible focus), one component (`ThemeButton.astro`) for the landing header and, as Starlight's `ThemeSelect` override, the docs header.
- Devices: four groups from `src/data/devices.json` plus the profile files (a profile with `midi.ports` is a controller's by RFC 0024). Unlisted profiles show under "Not yet classified" (none today).
- Font: Inter self-hosted from `@fontsource/inter` 5.3.0 (latin 400, 600, 700 woff2, 72 KB), SIL OFL text in `public/FONTS-LICENSE.txt`; no third-party request. Glyphs outside Latin fall back to system fonts.
- Link rewriting is now an mdast plugin for Astro 7's markdown pipeline (`docsLinks` in `lib/docs.mjs`, set as `markdown.processor: satteri({ mdastPlugins })`); the loader passes each file's `fileURL` to `renderMarkdown`. `npm test` covers the tricky cases. This replaces the regex pass and its weak points (code, titles, parentheses); the H1 anchor and GitHub-`main` caveats remain.
- Package display names go through one function, `displayName` in `lib/packages.mjs`.
- `astro preview` does not serve dot-folders (404 for `/.well-known/...`); GitHub Pages and `python -m http.server` do. measure.sh therefore checks with a plain static server.
- The synthetic `docs/404` entry is now a draft with an empty `DraftContentNotice` override: it silences Astro's missing-entry warning without a route conflict. The Starlight 404 page shows its own default text.
- Not verified: the deploy workflow has never run; whether Pages keeps serving the old branch build between the switch and the first Actions deploy; the new devices page, theme icon and fonts were not looked at in a browser.

Nothing is deployed. Astro 7.4.12, Starlight 0.43.1 (exact versions in package.json, lockfile committed), Node v26.13.1.

## Run it

    npm ci && npm run build        # output in dist/, then the identity check
    npm run preview                # http://127.0.0.1:4321, bound to localhost only
    ./measure.sh                   # every number below (about a minute)
    node scripts/check-links.mjs   # link and anchor check of dist/

Configuration (all in `lib/config.mjs`): `OSCAIRN_DOCS_DIR` (default `../../../oscairn/docs`), `OSCAIRN_PACKAGES_DIR` (default `../../../packages`), `OSCAIRN_PROFILES_DIR` (default `<docs>/../hosts/standalone/profiles`). Relative values resolve against the site folder; the build must be started from it (see workarounds).

## What was built

- Landing: design A rebuilt as an Astro page (`src/pages/index.astro`), tokens copied verbatim from design-a.html, light and dark by the system setting (CSS media query, works without JS) plus a Theme button (needs JS). The four package cards are real records (Sampler, Effects, Step Sequencer, FM cartridges). The screenshot is still the design's placeholder.
- Docs: all 67 Markdown files under docs/ and docs/rfcs, at /docs/... Starlight sidebar (Guides alphabetical by title with the README as Overview, then RFCs in numeric order with their titles, collapsed), search, per-page "Edit page" link to github.com/oscairn/oscairn/edit/main/docs/<file>.
- Packages: /packages/ (table: name, id, kind, latest, platforms, license; text and kind filter in plain JS) and one page per package (16) with a spec card and a versions table (signed archive file name, size, SHA-256 prefix, source revision). No download buttons.
- Devices: /devices/ from the 8 profile JSON files, with the pre-release statement.
- 404: Starlight's own 404 page. Favicon: the mark as SVG (dark strokes switch for dark mode). Meta: title, description, Open Graph; `noindex` was set in the first round and is removed in the second.
- Fonts: see the second round. No external requests at runtime (measured: 0 on the three pages), no trackers, no cookies (only localStorage `starlight-theme`, set when the toggle is used).

## How the docs are pulled in

`lib/docs.mjs` is a content-collection loader (`src/content.config.ts`, collection `docs` with Starlight's schema). At every build it walks DOCS_DIR in place, and for each file: takes the first `# heading` as the title and removes that line (Starlight prints the title itself); sets the entry id to `docs/<path>` (so URLs are /docs/..., README.md becomes the section index); sets `editUrl`; rewrites links and image paths in the Markdown text; renders it with the loader's `renderMarkdown`. Nothing is copied into the folder except images: an Astro integration in astro.config.mjs copies docs/images to dist/docs-images/ at build (and serves them in dev; the dev path is untested).

Link rewriting (an mdast plugin since the second round), relative to the file's own path:
- `x.md#anchor` to a known doc becomes `/docs/x/#anchor`; heading ids come from the same slugger as GitHub, and the link checker found no broken anchor.
- paths under images/ become /docs-images/...
- everything else that is relative (schemas, source files, directories, other repository folders) becomes a github.com/oscairn/oscairn blob or tree link on `main`.

Weak points:
- The plugin works on the syntax tree (links, images, reference definitions) and on raw `src`/`href` attributes in HTML nodes by regex.
- The H1 is removed, so a link to `file.md#<the H1's own slug>` would break. No doc has one.
- No doc under docs/ references an image today (only the repository's top README does). The image path was therefore tested with a temporary copy of docs/ holding an added page (image, `file.md#anchor`, `rfcs/README.md`, `../hosts`): images resolved, links resolved, the deliberate bad anchor was the only broken link. The temp copy is not kept.
- Links to non-Markdown files point at GitHub `main`, which assumes that branch exists and the file is committed.
- Edits to a doc are picked up on the next build; in dev the loader registers a watcher on the folder (untested).
- No doc broke the build. Doc content handled in the loader: GFM task-list checkboxes (RFC Progress lists) come out unlabeled, so the loader adds aria-label "done" / "not done". One table in the docs has an empty header cell (an axe "minor" finding left as is; the docs are not edited).

## How the catalog is generated

`lib/packages.mjs` reads `packages/<id>/<version>.json` (format oscairn.repository-release) at build, and `publishers/*.json`. I did not run the repository's build-index.py: it verifies signatures with `oscairn-sign` and builds archives, and its index (`index/<sha256>.json.gz`) is not in a checkout. The records carry no name or kind, which the published index takes from each archive's manifest, so the loader reads `library.json` out of the `.olib` (a zip, parsed with node:zlib, no dependency) for the name and falls back to the id when the archive is absent. Kind is derived from tags (instrument, audio-effect, note-effect, patches), which is my mapping, not the repository's. Pages come from `getStaticPaths` in `src/pages/packages/[id].astro`. Platforms of two content packages are empty in their records; the pages say "any".

## Workarounds

1. `lib/` is bundled into dist/.prerender, so `import.meta.url` cannot find the site folder; paths resolve against `process.cwd()`.
2. Loader entries must not carry an absolute `filePath` (Astro 7 refuses it); omitted.
3. A user `src/pages/404.astro` collides with Starlight's injected /404 route (warns it will be a hard error later); removed and used Starlight's. A synthetic `docs/404` entry silences a warning; its text is not shown.
4. An `i18n` collection is declared only to silence a Starlight warning.
5. Starlight has no nav-links slot, so the header's nav is rendered through the `SocialIcons` override (and the mobile menu through `MobileMenuFooter`).
6. Starlight's colours are remapped to design A's tokens in `src/styles/starlight.css` (--sl-* variables). Custom pages share Starlight's `starlight-theme` storage key so the toggle is consistent.
7. Starlight does not serve the landing: / is a plain Astro page with its own layout; docs, packages and devices share the header markup but not a layout engine.
8. Markdown plugins: Astro 7's default processor is the Rust-based "satteri"; the config sets it explicitly with an mdast plugin. `@astrojs/markdown-satteri` is therefore a direct pinned dependency.

## What was hard

The Astro 7 content API was unfamiliar (frameworks.md said "unverified" for the relative-link transform; it works but is mine). A syntax error in the loader once went unnoticed because a build reused a cached config; the final `measure.sh` run clears caches and passed. The design's long license strings (the Sampler's has a dozen licenses) needed truncation in the listing.

## Upgrade to the next major would likely touch

- `lib/docs.mjs`: the loader context (`store`, `parseData`, `renderMarkdown`) and the markdown processor change (remark/rehype to satteri already happened in 7).
- Component overrides (`SocialIcons`, `SiteTitle`, `MobileMenuFooter`) and the import path of Starlight's default MobileMenuFooter.
- Starlight's `--sl-*` variable names and class names used in `starlight.css`.
- The Starlight 404 route and `i18n` collection requirements; Pagefind integration.
- Node floor (Astro 7 needs 22.23.4+).

## Measurements (./measure.sh, this machine, 2026-11-16)

| Item | Value |
|---|---|
| Node / npm | v26.13.1 / 11.20.0 |
| npm packages installed (unique) | 262 |
| node_modules | 176 MB |
| Own source lines (git ls-files, no lockfiles, docs, public/, root transition copies) | 1,206: .astro 333, .mjs 514 (config, loaders, scripts, tests), .css 166, .json 60 (incl. devices.json), .yml 68, .sh 52, .ts 9, .gitignore 4. Measurement tools live in measure/ with their own node_modules, not counted above. |
| Clean build (dist, .astro, caches removed), 3 runs | 2.50 s, 2.52 s, 2.49 s; median 2.50 s (the machine was loaded, load average about 29; earlier runs on the same code ranged 2.6 to 4.3 s) |
| Rebuild after touching one doc | 2.52 s (a full build; no incremental mode) |
| Output | 228 files, 10,144,080 bytes, 4,853,062 bytes gzip (each file gzipped alone, level 9). 87 HTML pages |

| Page | HTML raw / gzip | CSS raw / gzip (+ inline raw) | JS raw / gzip (+ inline raw) | Requests at load | Without JS |
|---|---|---|---|---|---|
| Landing | 14,111 / 4,519 | 4,453 / 1,446 (+3,086) | 2,474 / 1,118 (+671) | 7 (HTML, CSS, JS, favicon, 3 fonts of 72,472 bytes) | Readable and navigable; only the Theme button is absent (system setting still applies) |
| Longest doc (RFC 0031) | 289,502 / 69,627 | 87,465 / 16,559 (+3,086) | 8,962 / 4,305 (+3,983) | 12 (incl. 3 fonts) | Content and the full sidebar are in the HTML. Search needs JS. Mobile menu, copy buttons: not checked without JS |
| Packages listing | 18,292 / 5,028 | 4,453 / 1,446 (+4,238) | 2,474 / 1,118 (+1,383) | 7 (incl. 3 fonts) | Full table readable; the filter form is hidden until JS runs |

"Without JS" is judged from the built HTML (content, links and hidden attributes), not in a browser.

Search: Pagefind, 2,668 KiB in 108 files, of which index chunks 970 KB and 67 fragments 892 KB, loaded on demand. No docs page references a pagefind file in its HTML; the search component loads it when opened (by Starlight's script, read not exercised). The 67 docs pages are indexed. Served from `astro preview` on 127.0.0.1, /pagefind/pagefind.js returns 200. Search itself was not run in a browser.

Link check (`scripts/check-links.mjs`, 10,326 internal links, anchors included, 87 pages): 0 broken. The checker was shown to catch a deliberate bad anchor and a wrong image path during development.

Accessibility (axe-core 4.10.2 in jsdom, `measure/pages.mjs`; color-contrast disabled because jsdom has no layout): landing 0 and packages 0 violations; the RFC page 2: empty-table-header (minor, from the docs' own table) and landmark-unique (moderate, two Starlight "On this page" navs of which one is hidden by CSS jsdom does not apply). Color contrast, keyboard use and screen-reader behavior: unverified. Tokens are design A's own.

## Not verified

No browser was available (none installed, none downloaded), so nothing was looked at: layout, dark mode, the theme toggle, phone width, the search dialog, the packages filter's behavior, and the JS-disabled views are unseen. The dev server (`astro dev`) and its image middleware were not run. Responsiveness of the landing is by the design's own media query.
