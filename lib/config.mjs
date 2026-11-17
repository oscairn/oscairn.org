// The one place that says where the code repository and the package repository are.
// Override with OSCAIRN_DOCS_DIR / OSCAIRN_PACKAGES_DIR (absolute, or relative to the site folder),
// so CI can check the repositories out beside the site.
import path from 'node:path';

// The build runs from the site folder (npm run build); lib/ is bundled into dist/, so import.meta.url cannot say where the site is.
export const SITE_ROOT = process.cwd();
const pick = (name, fallback) => path.resolve(SITE_ROOT, process.env[name] || fallback);

/** The code repository's docs folder (Markdown and docs/rfcs, docs/images). */
export const DOCS_DIR = pick('OSCAIRN_DOCS_DIR', '../../../oscairn/docs');
/** The package repository checkout (packages/<id>/<version>.json, publishers/). */
export const PACKAGES_DIR = pick('OSCAIRN_PACKAGES_DIR', '../../../packages');
/** Device profiles, by default in the code repository beside docs/. */
export const PROFILES_DIR = pick('OSCAIRN_PROFILES_DIR', path.join(DOCS_DIR, '../hosts/standalone/profiles'));

export const GITHUB = 'https://github.com/oscairn/oscairn';
export const GITHUB_BRANCH = 'main';
/** URL prefix for the images the docs refer to (copied from DOCS_DIR/images at build). */
export const IMAGE_BASE = '/docs-images/';

/** The published package repository (ready-made archives and the signed index live under it). */
export const PACKAGES_SITE = (process.env.OSCAIRN_PACKAGES_SITE || 'https://packages.oscairn.org/').replace(/\/?$/, '/');
