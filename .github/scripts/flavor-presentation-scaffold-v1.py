from pathlib import Path

PRESENTATION = Path('presentation-contract-v1.js')
SMOKE = Path('.github/scripts/public-frontend-browser-smoke-v2.mjs')

flavor_js = r''';(()=>{"use strict";
const CONTRACT="UNIVERSAL_FLAVOR_PRESENTATION_V1";
const shell=document.getElementById("detail-shell");if(!shell)return;
const esc=x=>String(x??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
let catalogPromise=null;
const catalog=()=>catalogPromise||(catalogPromise=window.__CSWRuntimeCatalogPromise?Promise.resolve(window.__CSWRuntimeCatalogPromise):fetch(`runtime/catalog.json?flavor=${Date.now()}`,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(`runtime catalog HTTP ${r.status}`);return r.json()}));
function evidence(cat,claim){const ref=Array.isArray(claim?.sourceRefs)?claim.sourceRefs.find(Boolean):null,src=ref?cat?.sources?.[ref]:null,grade=["A","B","C"].includes(claim?.confidence)?`<span class="ucd-grade grade-${esc(claim.confidence.toLowerCase())}">根拠 ${esc(claim.confidence)}</span>`:"";return grade||src?.url?`<div class="ucd-evidence-row">${grade}${src?.url?`<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.publisher||src.title||"情報源")} <span aria-hidden="true">↗</span></a>`:""}</div>`:""}
function bind(root,button,panel){if(button.dataset.flavorBound===CONTRACT)return;button.dataset.flavorBound=CONTRACT;button.addEventListener("click",ev=>{ev.preventDefault();const wasOpen=button.getAttribute("aria-expanded")==="true"&&!panel.hidden;root.querySelectorAll("[data-ucd-tab]").forEach(b=>{b.setAttribute("aria-expanded","false");b.classList.remove("is-active")});root.querySelectorAll("[data-ucd-panel]").forEach(p=>p.hidden=true);if(!wasOpen){button.setAttribute("aria-expanded","true");button.classList.add("is-active");panel.hidden=false}})}
async function decorate(){const id=new URL(location.href).searchParams.get("strain");if(!id)return;const cat=await catalog(),cultivar=(cat?.cultivars||[]).find(x=>x?.id===id),claim=cultivar?.flavors;if(!cultivar||!["confirmed","disputed"].includes(claim?.status)||!Array.isArray(claim?.items)||!claim.items.length)return;const root=shell.querySelector(`.detail-public-v1[data-public-detail-id="${CSS.escape(id)}"]`),profile=root?.querySelector('.ucd-profile'),nav=profile?.querySelector('.ucd-profile-nav'),panels=profile?.querySelector('.ucd-profile-panels');if(!(root&&profile&&nav&&panels)){window.__CSWFlavorPresentationV1Error=`FLAVOR_CONTEXT_MISSING:${id}`;return}let button=nav.querySelector('[data-ucd-tab="flavor"]'),panel=panels.querySelector('[data-ucd-panel="flavor"]');if(!button){button=document.createElement('button');button.type='button';button.dataset.ucdTab='flavor';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',`ucd-${id}-flavor`);button.innerHTML='<span>味わい</span><i aria-hidden="true">⌄</i>';nav.appendChild(button)}if(!panel){panel=document.createElement('section');panel.id=`ucd-${id}-flavor`;panel.dataset.ucdPanel='flavor';panel.dataset.profileKind='flavor';panel.hidden=true;panels.appendChild(panel)}const note=String(cultivar?.publicContent?.ja?.flavorNote||claim?.note||'').trim();panel.innerHTML=`<div class="ucd-flavor-profile" data-flavor-presentation="v1"><div class="ucd-sensory-head"><span>FLAVOR PROFILE / 味わい</span><small>情報源に記載された味の表現</small></div><div class="ucd-flavor-terms">${claim.items.map(x=>`<span>${esc(x)}</span>`).join('')}</div>${note?`<div class="ucd-note"><small>公式の味わい説明</small><p>${esc(note)}</p></div>`:''}${evidence(cat,claim)}</div>`;bind(root,button,panel);root.dataset.flavorPresentationReady='v1';nav.dataset.count=String(nav.querySelectorAll('[data-ucd-tab]').length)}
const style=document.createElement('style');style.id='universal-flavor-presentation-v1-style';style.textContent='.ucd-flavor-profile{display:grid;gap:12px}.ucd-flavor-terms{display:flex;flex-wrap:wrap;gap:8px}.ucd-flavor-terms span{display:inline-flex;align-items:center;min-height:34px;padding:7px 11px;border:1px solid rgba(216,189,98,.22);border-radius:999px;background:linear-gradient(135deg,rgba(216,189,98,.08),rgba(43,85,55,.07));color:#e5e7dc;font-size:11px;font-weight:780}.ucd-flavor-profile .ucd-note{margin-top:1px}@media(max-width:390px){.ucd-flavor-terms{gap:6px}.ucd-flavor-terms span{min-height:32px;padding:6px 9px;font-size:10px}}';document.head.appendChild(style);
new MutationObserver(()=>queueMicrotask(()=>decorate().catch(e=>{window.__CSWFlavorPresentationV1Error=String(e?.message||e)}))).observe(shell,{childList:true,subtree:true});shell.addEventListener('click',()=>queueMicrotask(()=>decorate().catch(()=>{})),true);window.addEventListener('popstate',()=>queueMicrotask(()=>decorate().catch(()=>{})));queueMicrotask(()=>decorate().catch(e=>{window.__CSWFlavorPresentationV1Error=String(e?.message||e)}));
})();'''

smoke_block = r'''  const flavorCatalog = await getJson(`${baseUrl}runtime/catalog.json`);
  const flavorTarget = (flavorCatalog.cultivars || []).find(cultivar =>
    ['confirmed','disputed'].includes(cultivar?.flavors?.status) &&
    Array.isArray(cultivar?.flavors?.items) && cultivar.flavors.items.length
  );
  let flavor = null;
  if (flavorTarget) {
    await cdp.send('Page.navigate', { url: `${baseUrl}?strain=${encodeURIComponent(flavorTarget.id)}` });
    await waitFor(() => evalv(`document.readyState==='complete'`), 'Flavor target document complete');
    await waitFor(() => evalv(`document.getElementById('detail-dialog').open===true && document.querySelector('.detail-public-v1[data-public-detail-id="${flavorTarget.id}"] [data-ucd-tab="flavor"]') && document.querySelector('.detail-public-v1[data-public-detail-id="${flavorTarget.id}"] [data-profile-kind="flavor"]')`), 'Flavor universal presentation');
    await evalv(`document.querySelector('.detail-public-v1[data-public-detail-id="${flavorTarget.id}"] [data-ucd-tab="flavor"]').click()`);
    await waitFor(() => evalv(`(()=>{const root=document.querySelector('.detail-public-v1[data-public-detail-id="${flavorTarget.id}"]');const btn=root?.querySelector('[data-ucd-tab="flavor"]');const panel=root?.querySelector('[data-profile-kind="flavor"]');return btn?.getAttribute('aria-expanded')==='true' && panel && !panel.hidden})()`), 'Flavor panel expanded');
    flavor = await evalv(`(()=>{const root=document.querySelector('.detail-public-v1[data-public-detail-id="${flavorTarget.id}"]');const panel=root?.querySelector('[data-profile-kind="flavor"]');return {id:${JSON.stringify(flavorTarget.id)},text:panel?.innerText||'',items:[...panel?.querySelectorAll('.ucd-flavor-terms span')||[]].map(n=>n.textContent.trim()),horizontalOverflow:root.scrollWidth>root.clientWidth+1}})()`);
    for (const item of flavorTarget.flavors.items) if (!flavor.items.includes(item)) throw new Error(`Flavor item missing ${item}: ${JSON.stringify(flavor)}`);
    if (!flavor.text.includes('味わい')) throw new Error(`Flavor Japanese label missing: ${JSON.stringify(flavor)}`);
    if (flavor.horizontalOverflow) throw new Error(`Flavor detail has horizontal overflow: ${JSON.stringify(flavor)}`);
  }

'''

presentation_text = PRESENTATION.read_text(encoding='utf-8')
if 'UNIVERSAL_FLAVOR_PRESENTATION_V1' in presentation_text:
    raise SystemExit('Flavor presentation already exists')
PRESENTATION.write_text(presentation_text + '\n' + flavor_js + '\n', encoding='utf-8')

smoke_text = SMOKE.read_text(encoding='utf-8')
marker = "  const runtimeErrors = cdp.events.filter(event => event.method === 'Runtime.exceptionThrown');"
if smoke_text.count(marker) != 1:
    raise SystemExit(f'Flavor smoke insertion marker count={smoke_text.count(marker)}')
SMOKE.write_text(smoke_text.replace(marker, smoke_block + marker, 1), encoding='utf-8')
