import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import fs from 'node:fs';
import path from 'node:path';
import { DOCS_DIR, IMAGE_BASE } from './lib/config.mjs';
import { satteri } from '@astrojs/markdown-satteri';
import { listDocs, entryId, titleOf, docsLinks } from './lib/docs.mjs';

// Sidebar from the folder: top-level guides first (README is the overview), then the RFCs in numeric order.
const files = listDocs();
const item = (rel) => ({ label: rel === 'README.md' ? 'Overview' : titleOf(rel), link: '/' + entryId(rel) + '/' });
const guides = files.filter((f) => !f.includes('/')).sort((a, b) => (a === 'README.md' ? -1 : b === 'README.md' ? 1 : titleOf(a).localeCompare(titleOf(b))));
const rfcs = files.filter((f) => f.startsWith('rfcs/') && f !== 'rfcs/README.md').sort();
const sidebar = [
  { label: 'Guides', items: guides.map(item) },
  { label: 'RFCs', collapsed: true, items: [{ label: 'About RFCs', link: '/docs/rfcs/' }, ...rfcs.map(item)] },
];

// Serves the docs' images from DOCS_DIR/images at /docs-images/ (dev) and copies them at build.
const docsImages = {
  name: 'docs-images',
  hooks: {
    'astro:server:setup': ({ server }) => {
      server.middlewares.use(IMAGE_BASE, (req, res, next) => {
        const file = path.join(DOCS_DIR, decodeURIComponent(req.url.split('?')[0]));
        if (file.startsWith(DOCS_DIR) && fs.existsSync(file) && fs.statSync(file).isFile()) res.end(fs.readFileSync(file));
        else next();
      });
    },
    'astro:build:done': ({ dir }) => {
      fs.cpSync(path.join(DOCS_DIR, 'images'), path.join(dir.pathname, IMAGE_BASE), { recursive: true });
    },
  },
};

export default defineConfig({
  markdown: { processor: satteri({ mdastPlugins: [docsLinks()] }) },
  site: 'https://oscairn.org',
  integrations: [
    starlight({
      title: 'Oscairn',
      description: 'Oscairn is an open instrument platform: one realtime host for synthesis engines, samplers, effects and sequencers.',
      favicon: '/favicon.svg',
      sidebar,
      customCss: ['@fontsource/inter/latin-400.css', '@fontsource/inter/latin-600.css', '@fontsource/inter/latin-700.css', './src/styles/tokens.css', './src/styles/starlight.css'],
      components: {
        SocialIcons: './src/components/NavLinks.astro',
        DraftContentNotice: './src/components/NoNotice.astro',
        ThemeSelect: './src/components/ThemeButton.astro',
        SiteTitle: './src/components/SiteTitle.astro',
        MobileMenuFooter: './src/components/MobileMenuFooter.astro',
      },
      lastUpdated: false,
      pagination: true,
    }),
    docsImages,
  ],
});
