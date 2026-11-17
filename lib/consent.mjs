// The consent banner and the gate in front of Google Tag Manager (lib/gtm.mjs), shared by SiteLayout.astro and the
// Starlight head config: one inline script, first in <head>, and one style block. Nothing from googletagmanager.com
// is requested until the visitor accepts. The choice is kept in localStorage ('granted' or 'denied'); a Global
// Privacy Control or Do Not Track signal counts as declined and shows no banner. Elements with data-consent-open
// (the footer links) show the banner again.
import { GTM_SCRIPT } from './gtm.mjs';

export const CONSENT_SCRIPT = `(function(){
var K='oscairn-consent',c=null,on=false,box=null;
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments)}
gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
try{c=localStorage.getItem(K)}catch(e){}
var off=navigator.globalPrivacyControl===true||navigator.doNotTrack==='1';
if(off)c='denied';
function load(){if(on)return;on=true;gtag('consent','update',{analytics_storage:'granted'});${GTM_SCRIPT.replace(/\n/g, '')}}
function save(v){try{localStorage.setItem(K,v)}catch(e){}}
function close(){if(box){box.remove();box=null}}
function choose(v){save(v);close();if(v==='granted')load()}
function show(){
if(box||off)return;
box=document.createElement('div');
box.className='oc-consent';box.setAttribute('role','region');box.setAttribute('aria-label','Analytics consent');
var p=document.createElement('p');p.textContent='This site uses Google Analytics to count visits.';
var a=document.createElement('button'),d=document.createElement('button');
a.type=d.type='button';a.textContent='Accept';d.textContent='Decline';
a.onclick=function(){choose('granted')};d.onclick=function(){choose('denied')};
box.append(p,a,d);document.body.appendChild(box);
}
if(off)document.documentElement.setAttribute('data-consent-off','');
if(c==='granted')load();
document.addEventListener('DOMContentLoaded',function(){if(c!=='granted'&&c!=='denied')show()});
document.addEventListener('click',function(e){if(e.target.closest&&e.target.closest('[data-consent-open]'))show()});
})();`;

export const CONSENT_STYLE = `.oc-consent{position:fixed;left:16px;bottom:16px;z-index:50;display:flex;flex-wrap:wrap;align-items:center;gap:10px;max-width:340px;padding:12px 14px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:8px;font:14px/1.4 var(--sans)}
.oc-consent p{flex:1 1 100%;margin:0}
.oc-consent button{flex:1 1 0;min-height:40px;padding:6px 14px;font:700 13px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--text);background:var(--raised);border:2px solid var(--border);border-radius:4px;cursor:pointer}
.oc-consent button:hover{filter:brightness(1.08)}
.oc-consent button:focus-visible,.oc-open:focus-visible{outline:3px solid var(--focus);outline-offset:3px}
.oc-open{font:inherit;color:inherit;background:none;border:0;padding:0;text-decoration:underline;cursor:pointer}
[data-consent-off] [data-consent-open]{display:none}
@media (max-width:600px){.oc-consent{left:0;right:0;bottom:0;max-width:none;flex-wrap:nowrap;gap:8px;padding:8px 12px;border-width:1px 0 0;border-radius:0;font-size:13px}
.oc-consent p{flex:1 1 auto}
.oc-consent button{flex:0 0 auto;min-height:44px}}`;
