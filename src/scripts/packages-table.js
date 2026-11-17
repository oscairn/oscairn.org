// Progressive enhancement of /packages/: the build renders the table; this fills it from the published index.
// Filtering, sorting and paging happen on in-memory entries; only one page of rows is in the DOM at a time.
import { fetchRepository } from '../../lib/repo-client.mjs';
import { search, escapeHtml } from '../../lib/catalog.mjs';

const app = document.getElementById('pkg-app');
const PAGE = 50;
const q = document.getElementById('q'), kind = document.getElementById('kind'), platform = document.getElementById('platform'), sort = document.getElementById('sort');
const body = document.getElementById('pkg-body'), count = document.getElementById('count'), status = document.getElementById('pkg-status'), more = document.getElementById('more');
const filter = document.getElementById('filter');

// Where the repository is: the page's address, or (only for localhost, for tests) ?repo=.
const params = new URLSearchParams(location.search);
let site = app.dataset.repo;
const override = params.get('repo');
if (override && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(override)) site = override;

const snapshot = JSON.parse(document.getElementById('snapshot').textContent);
const builtIds = new Set(snapshot.map((e) => e.id));
let entries = snapshot;
let shown = 0, results = [];

const href = (e) => (builtIds.has(e.id) ? `/packages/${e.id}/` : `/packages/view/?id=${encodeURIComponent(e.id)}`);
const row = (e) => `<tr><th scope="row" data-label="Name"><a href="${href(e)}">${escapeHtml(e.name)}</a></th><td class="mono" data-label="ID">${escapeHtml(e.id)}</td><td data-label="Kind">${escapeHtml(e.kind)}</td><td class="mono" data-label="Latest">${escapeHtml(e.latest)}</td><td class="mono" data-label="Platforms">${escapeHtml(e.platforms.join(', ') || 'any')}</td><td class="lic" data-label="License" title="${escapeHtml(e.license)}">${escapeHtml(e.license)}</td></tr>`;

function fillSelects() {
  const keep = { kind: kind.value, platform: platform.value };
  const kinds = [...new Set(entries.map((e) => e.kind))].sort();
  const plats = [...new Set(entries.flatMap((e) => e.platforms))].sort();
  kind.innerHTML = '<option value="">All</option>' + kinds.map((k) => `<option>${escapeHtml(k)}</option>`).join('');
  platform.innerHTML = '<option value="">All</option>' + plats.map((p) => `<option>${escapeHtml(p)}</option>`).join('') + '<option value="any">any (content)</option>';
  kind.value = keep.kind; platform.value = keep.platform;
}

function syncUrl() {
  const u = new URLSearchParams(location.search);
  for (const [k, v, d] of [['q', q.value.trim(), ''], ['kind', kind.value, ''], ['platform', platform.value, ''], ['sort', sort.value, 'name'], ['page', String(Math.ceil(shown / PAGE)), '1']]) {
    if (v && v !== d) u.set(k, v); else u.delete(k);
  }
  const s = u.toString();
  history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash);
}

function render({ keepPages = false } = {}) {
  const t0 = performance.now();
  const focusHref = document.activeElement?.closest?.('#pkg-body a')?.getAttribute('href');
  results = search(entries, { q: q.value, kind: kind.value, platform: platform.value, sort: sort.value });
  if (!keepPages) shown = Math.min(PAGE, results.length);
  shown = Math.min(Math.max(shown, Math.min(PAGE, results.length)), results.length);
  body.innerHTML = results.slice(0, shown).map(row).join('');
  count.textContent = `${results.length.toLocaleString('en-US')} of ${entries.length.toLocaleString('en-US')} packages match; ${shown.toLocaleString('en-US')} shown`;
  more.hidden = shown >= results.length;
  more.textContent = `Show ${Math.min(PAGE, results.length - shown)} more`;
  document.getElementById('none').hidden = results.length > 0;
  if (focusHref) body.querySelector(`a[href="${CSS.escape(focusHref)}"]`)?.focus();
  app.dataset.lastMs = (performance.now() - t0).toFixed(1);
  syncUrl();
}

more.addEventListener('click', () => {
  const next = results.slice(shown, shown + PAGE);
  body.insertAdjacentHTML('beforeend', next.map(row).join(''));
  shown += next.length;
  count.textContent = `${results.length.toLocaleString('en-US')} of ${entries.length.toLocaleString('en-US')} packages match; ${shown.toLocaleString('en-US')} shown`;
  more.hidden = shown >= results.length;
  more.textContent = `Show ${Math.min(PAGE, results.length - shown)} more`;
  syncUrl();
});

let timer;
q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => render(), 120); });
for (const el of [kind, platform, sort]) el.addEventListener('change', () => render());
filter.addEventListener('submit', (e) => e.preventDefault());

// Start from the URL, render the build-time snapshot at once, then replace it with the live index.
fillSelects();
q.value = params.get('q') || ''; sort.value = params.get('sort') || 'name';
kind.value = params.get('kind') || ''; platform.value = params.get('platform') || '';
filter.hidden = false;
shown = Math.max(1, Number(params.get('page') || 1)) * PAGE;
render({ keepPages: true });

const builtOn = new Date(app.dataset.built);
const fmt = (d) => d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
status.textContent = 'Reading the repository...';
try {
  const repo = await fetchRepository(site);
  entries = repo.entries;
  fillSelects();
  kind.value = params.get('kind') || kind.value; platform.value = params.get('platform') || platform.value;
  render({ keepPages: true });
  status.textContent = `Showing the repository as of ${fmt(repo.asOf)} (serial ${repo.serial}, read from the ${repo.via === 'catalog' ? 'compact catalog' : 'full index'}). Read as published; this page does not check signatures, the instrument does when it installs.`;
  app.dataset.live = repo.via;
} catch (err) {
  status.textContent = `Showing the list from when this site was built (${fmt(builtOn)}); the live repository could not be read.`;
  app.dataset.live = 'failed';
  console.warn('packages: live index not available:', err.message);
}
