// /packages/view/?id=<id>: a package page for a package the site build did not know. Prefers the built page.
import { fetchPackage } from '../../lib/repo-client.mjs';
import { escapeHtml as h, formatSize } from '../../lib/catalog.mjs';

const root = document.getElementById('view');
const msg = document.getElementById('v-msg'), title = document.getElementById('v-title'), out = document.getElementById('v-body');
const params = new URLSearchParams(location.search);
let site = root.dataset.repo;
const override = params.get('repo');
if (override && /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(override)) site = override;
const id = params.get('id') || '';

const links = (v) => v.links.length
  ? v.links.map((l) => `<a class="np" href="${h(l.url)}">${h(l.platform ?? 'any')}</a>${l.size ? ` (about ${formatSize(l.size)})` : ''}`)
  : [h(v.platforms.join(', ') || 'any')];

async function main() {
  if (!/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)+$/.test(id)) { msg.textContent = 'No package named in the address. See the package list.'; return; }
  // The built page is preferred when it exists.
  try {
    const r = await fetch(`/packages/${id}/`, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    if (r.ok && !(params.get('repo'))) { location.replace(`/packages/${id}/`); return; }
  } catch { /* fall through to the live data */ }
  let entry;
  try { ({ entry } = await fetchPackage(site, id)); }
  catch (e) { msg.innerHTML = `The repository could not be read (${h(e.message)}). Try the <a href="/packages/">package list</a> again later.`; return; }
  if (!entry) { msg.innerHTML = `No package <span class="mono">${h(id)}</span> is in the repository. See the <a href="/packages/">package list</a>.`; return; }
  document.title = `${entry.name} | Oscairn`;
  title.textContent = entry.name;
  const v0 = entry.versions[0];
  msg.textContent = entry.summary;
  out.innerHTML = `
<p class="mono" style="color:var(--muted);margin:0 0 16px">${h(entry.id)}</p>
<div class="card spec"><dl>
<div><dt>Latest version</dt><dd class="mono">${h(entry.latest)}</dd></div>
<div><dt>Kind</dt><dd>${h(entry.kind)}</dd></div>
<div><dt>Platforms</dt><dd class="mono">${links(v0).join(', ')}</dd></div>
<div><dt>License</dt><dd>${h(entry.license)}</dd></div>
<div><dt>Publisher</dt><dd>${h(entry.publisher.name)} <span class="mono">(${h(entry.publisher.id)})</span></dd></div>
<div><dt>Source</dt><dd><a href="https://github.com/oscairn/packages/tree/main/packages/${h(entry.id)}">The repository's records for this package</a></dd></div>
${entry.tags.length ? `<div><dt>Tags</dt><dd class="mono">${h(entry.tags.join(', '))}</dd></div>` : ''}
</dl></div>
<h2 style="margin-top:40px">Versions</h2>
<p class="eg">The instrument installs packages itself. The platform links are the ready-made archives of that version, for installing by hand or offline from the Library (Install, File). Read live from the published index, which this page does not verify; the instrument checks signatures when it installs.</p>
<div class="tablewrap" tabindex="0" role="region" aria-label="Versions (scrolls sideways)"><table class="pkgs"><thead><tr><th>Version</th><th>Channel</th><th>Platforms</th></tr></thead><tbody>
${entry.versions.map((v) => `<tr><th scope="row" class="mono" data-label="Version">${h(v.version)}${v.yanked ? ' (yanked)' : ''}</th><td data-label="Channel">${h(v.channel)}</td><td class="mono" data-label="Platforms">${links(v).join('<br>')}</td></tr>`).join('')}
</tbody></table></div>
${v0.requires.length ? `<h2 style="margin-top:40px">Needs</h2><ul class="mono">${v0.requires.map((r) => `<li><a href="/packages/view/?id=${encodeURIComponent(r.id)}">${h(r.id)}</a> ${h(r.version || '')}</li>`).join('')}</ul>` : ''}`;
}
main();
