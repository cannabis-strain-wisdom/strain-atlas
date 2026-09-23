import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.env.CSW_BASE_URL || 'http://127.0.0.1:4173/';
const chrome = process.env.CHROME_BIN;
if (!chrome) throw new Error('CHROME_BIN is required');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'csw-chrome-'));
const proc = spawn(chrome, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--remote-debugging-port=9222',
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

let stderr = '';
proc.stderr.on('data', data => { stderr += String(data); });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
  return response.json();
}

async function waitFor(fn, label, timeout = 15000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeout) {
    try {
      last = await fn();
      if (last) return last;
    } catch (error) {
      last = error;
    }
    await sleep(150);
  }
  throw new Error(`Timeout waiting for ${label}${last instanceof Error ? `: ${last.message}` : ''}`);
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        message.error
          ? pending.reject(new Error(JSON.stringify(message.error)))
          : pending.resolve(message.result);
      } else {
        this.events.push(message);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.ws.close(); }
}

async function main() {
  await waitFor(async () => {
    try { return await getJson('http://127.0.0.1:9222/json/version'); }
    catch { return false; }
  }, 'Chrome DevTools');

  const pages = await getJson('http://127.0.0.1:9222/json/list');
  const page = pages.find(item => item.type === 'page');
  if (!page) throw new Error('No Chrome page target');

  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: baseUrl });

  async function evalv(expression) {
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(`Eval exception: ${result.exceptionDetails.text}`);
    return result.result.value;
  }

  await waitFor(() => evalv(`document.readyState==='complete'`), 'document complete');
  await waitFor(() => evalv(`document.querySelectorAll('#latest-grid [data-strain-id]').length>=1 && document.querySelectorAll('#cultivar-grid [data-strain-id]').length>=1`), 'cultivar cards');
  const initial = await evalv(`({latest:document.querySelectorAll('#latest-grid [data-strain-id]').length,all:document.querySelectorAll('#cultivar-grid [data-strain-id]').length})`);

  await evalv(`(()=>{const e=document.getElementById('search');e.value='Bubble Gum';e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
  await waitFor(() => evalv(`document.querySelectorAll('#cultivar-grid [data-strain-id]').length>=1`), 'search results');
  const searchCount = await evalv(`document.querySelectorAll('#cultivar-grid [data-strain-id]').length`);
  await evalv(`(()=>{const e=document.getElementById('search');e.value='';e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);

  await evalv(`document.querySelector('[data-explore="sativa"]').click()`);
  await waitFor(() => evalv(`document.querySelector('[data-explore="sativa"]').classList.contains('is-active') && document.querySelectorAll('#cultivar-grid [data-strain-id]').length>=1`), 'sativa filter');
  const sativaCount = await evalv(`document.querySelectorAll('#cultivar-grid [data-strain-id]').length`);
  await evalv(`document.querySelector('[data-explore="all"]').click()`);
  await waitFor(() => evalv(`document.querySelector('[data-explore="all"]').classList.contains('is-active')`), 'type reset');

  await waitFor(() => evalv(`document.querySelectorAll('#generation-options [data-generation]').length>=1`), 'generation options');
  const generation = await evalv(`document.querySelector('#generation-options [data-generation]').dataset.generation`);
  await evalv(`document.querySelector('#generation-options [data-generation]').click()`);
  await waitFor(() => evalv(`document.querySelector('#generation-options [data-generation]').getAttribute('aria-pressed')==='true' && document.querySelectorAll('#cultivar-grid [data-strain-id]').length>=1`), 'generation filter');
  const generationCount = await evalv(`document.querySelectorAll('#cultivar-grid [data-strain-id]').length`);
  await evalv(`document.getElementById('clear-filters').click()`);
  await waitFor(() => evalv(`document.querySelector('#generation-options [data-generation]').getAttribute('aria-pressed')==='false'`), 'generation clear');

  const hasCbd = await evalv(`!!document.querySelector('[data-category="cbd"]')`);
  if (!hasCbd) throw new Error('CBD category control missing');
  await evalv(`document.querySelector('[data-category="cbd"]').click()`);
  await waitFor(() => evalv(`document.querySelector('[data-category="cbd"]').getAttribute('aria-pressed')==='true' && document.querySelectorAll('#cultivar-grid [data-strain-id]').length>=1`), 'CBD category');
  const cbdCount = await evalv(`document.querySelectorAll('#cultivar-grid [data-strain-id]').length`);
  await evalv(`document.getElementById('clear-filters').click()`);
  await waitFor(() => evalv(`document.querySelector('[data-category="cbd"]').getAttribute('aria-pressed')==='false'`), 'category clear');

  await waitFor(() => evalv(`document.querySelectorAll('#breeder-filter option').length>1`), 'breeder options');
  const breeder = await evalv(`Array.from(document.querySelectorAll('#breeder-filter option')).find(o=>o.value)?.value || ''`);
  if (!breeder) throw new Error('No non-empty breeder option');
  await evalv(`(()=>{const e=document.getElementById('breeder-filter');e.value=${JSON.stringify(breeder)};e.dispatchEvent(new Event('change',{bubbles:true}));return e.value})()`);
  await waitFor(() => evalv(`document.getElementById('breeder-filter').value===${JSON.stringify(breeder)} && document.querySelectorAll('#cultivar-grid [data-strain-id]').length>=1`), 'breeder filter');
  const breederCount = await evalv(`document.querySelectorAll('#cultivar-grid [data-strain-id]').length`);
  await evalv(`document.getElementById('clear-filters').click()`);
  await waitFor(() => evalv(`document.getElementById('breeder-filter').value===''`), 'breeder clear');

  await evalv(`document.getElementById('latest-disclosure').open=true;true`);
  const latestId = await evalv(`document.querySelector('#latest-grid [data-strain-id]').dataset.strainId`);
  await evalv(`document.querySelector('#latest-grid [data-strain-id]').click()`);
  await waitFor(() => evalv(`document.getElementById('detail-dialog').open===true && new URL(location.href).searchParams.get('strain')`), 'latest detail open');
  const latestTitle = await evalv(`document.querySelector('#detail-dialog h2')?.textContent?.trim()`);
  await evalv(`document.querySelector('#detail-dialog .close-detail').click()`);
  await waitFor(() => evalv(`document.getElementById('detail-dialog').open===false && !new URL(location.href).searchParams.has('strain')`), 'latest detail close/history');

  await evalv(`document.getElementById('all-disclosure').open=true;true`);
  const allId = await evalv(`document.querySelector('#cultivar-grid [data-strain-id]').dataset.strainId`);
  await evalv(`document.querySelector('#cultivar-grid [data-strain-id]').click()`);
  await waitFor(() => evalv(`document.getElementById('detail-dialog').open===true && new URL(location.href).searchParams.get('strain')`), 'all detail open');
  const allTitle = await evalv(`document.querySelector('#detail-dialog h2')?.textContent?.trim()`);
  await evalv(`document.querySelector('#detail-dialog .close-detail').click()`);
  await waitFor(() => evalv(`document.getElementById('detail-dialog').open===false && !new URL(location.href).searchParams.has('strain')`), 'all detail close/history');

  await cdp.send('Page.navigate', { url: `${baseUrl}?strain=auto-cinderella-jack` });
  await waitFor(() => evalv(`document.readyState==='complete'`), 'Auto Cinderella Jack document complete');
  await waitFor(() => evalv(`document.getElementById('detail-dialog').open===true && document.querySelector('.detail-public-v1[data-public-detail-id="auto-cinderella-jack"] [data-cannabinoid-source-context="v1"]')`), 'Auto Cinderella Jack source-declared cannabinoid context');
  const autoCollapsed = await evalv(`(()=>{const card=document.querySelector('.detail-public-v1[data-public-detail-id="auto-cinderella-jack"] .ucd-cannabinoid-card');const grid=card?.querySelector('[data-source-declared-individual-values="v1"]');const context=card?.querySelector('[data-cannabinoid-source-context="v1"]');return {open:!!card?.open,gridDisplay:grid?getComputedStyle(grid).display:null,context:context?.innerText||'',values:[...grid?.querySelectorAll('strong')||[]].map(n=>n.textContent.trim())}})()`);
  if (autoCollapsed.open) throw new Error(`Auto Cinderella Jack cannabinoid card unexpectedly open: ${JSON.stringify(autoCollapsed)}`);
  if (autoCollapsed.gridDisplay !== 'none') throw new Error(`Auto Cinderella Jack individual values visible while collapsed: ${JSON.stringify(autoCollapsed)}`);
  if (!autoCollapsed.context.includes('掲載値 20.84〜25.94%') || !autoCollapsed.context.includes('3検体・5件')) throw new Error(`Auto Cinderella Jack summary context missing: ${JSON.stringify(autoCollapsed)}`);
  await evalv(`document.querySelector('.detail-public-v1[data-public-detail-id="auto-cinderella-jack"] .ucd-cannabinoid-card summary').click()`);
  await waitFor(() => evalv(`(()=>{const card=document.querySelector('.detail-public-v1[data-public-detail-id="auto-cinderella-jack"] .ucd-cannabinoid-card');const grid=card?.querySelector('[data-source-declared-individual-values="v1"]');return !!card?.open && grid && getComputedStyle(grid).display!=='none'})()`), 'Auto Cinderella Jack individual cannabinoid values expanded');
  const autoExpanded = await evalv(`(()=>{const card=document.querySelector('.detail-public-v1[data-public-detail-id="auto-cinderella-jack"] .ucd-cannabinoid-card');const grid=card?.querySelector('[data-source-declared-individual-values="v1"]');return {open:!!card?.open,gridDisplay:grid?getComputedStyle(grid).display:null,values:[...grid?.querySelectorAll('strong')||[]].map(n=>n.textContent.trim())}})()`);
  for (const value of ['20.84%','25.94%','21.3%','22.37%','24.28%']) if (!autoExpanded.values.includes(value)) throw new Error(`Auto Cinderella Jack expanded value missing ${value}: ${JSON.stringify(autoExpanded)}`);

  await cdp.send('Page.navigate', { url: `${baseUrl}?strain=rush-of-siam` });
  await waitFor(() => evalv(`document.readyState==='complete'`), 'Rush document complete');
  await waitFor(() => evalv(`document.getElementById('detail-dialog').open===true && document.querySelector('.detail-public-v1[data-public-detail-id="rush-of-siam"]') && document.querySelectorAll('.ucd-aroma-terms [data-aroma-public-term="v1"]').length===8`), 'Rush universal public presentation');
  const rush = await evalv(`(()=>{const root=document.querySelector('.detail-public-v1[data-public-detail-id="rush-of-siam"]');const text=document.getElementById('detail-shell')?.innerText||'';const aroma=[...root.querySelectorAll('.ucd-aroma-terms [data-aroma-public-term="v1"]')].map(node=>({review:node.querySelector('strong')?.textContent?.trim(),meaning:node.querySelector('small')?.textContent?.trim()}));const cannabinoid=[...root.querySelectorAll('.ucd-cannabinoid-grid strong')].map(node=>node.textContent.trim());const ratio=[...root.querySelectorAll('.ucd-ratio-head strong')].map(node=>node.textContent.trim());return {aroma,cannabinoid,ratio,lineageVisible:/Rush of Siam|ネヴィル|Kali China/.test(text),forbiddenEnglish:['ACE Seeds states a 65%','ACE Seeds lists THC at','ACE Seeds lists CBD at','Aroma hierarchy is source-declared','ACE Seeds lists Rush of Siam as','ACE Seeds developed Rush of Siam after Thai Chi'].filter(value=>text.includes(value)),horizontalOverflow:root.scrollWidth>root.clientWidth+1}})()`);
  if (rush.aroma.length !== 8 || rush.aroma.some(item => !item.review || !item.meaning)) throw new Error(`Rush Aroma terminology incomplete: ${JSON.stringify(rush.aroma)}`);
  if (!rush.aroma.some(item => item.review === 'Woody Lemon' && item.meaning)) throw new Error('Rush bilingual Aroma label missing');
  if (!rush.cannabinoid.includes('17.94%') || !rush.cannabinoid.includes('0.04%')) throw new Error(`Rush cannabinoid values missing: ${JSON.stringify(rush.cannabinoid)}`);
  if (!rush.ratio.includes('65%') || !rush.ratio.includes('35%')) throw new Error(`Rush ratio missing: ${JSON.stringify(rush.ratio)}`);
  if (!rush.lineageVisible) throw new Error('Rush lineage missing');
  if (rush.forbiddenEnglish.length) throw new Error(`Rush raw English fallback: ${rush.forbiddenEnglish.join(', ')}`);
  if (rush.horizontalOverflow) throw new Error('Rush detail has horizontal overflow');

  await cdp.send('Page.navigate', { url: `${baseUrl}?strain=permanent-marker` });
  await waitFor(() => evalv(`document.readyState==='complete'`), 'Permanent Marker document complete');
  await waitFor(() => evalv(`(()=>{const root=document.querySelector('.detail-public-v1[data-public-detail-id="permanent-marker"],.ucd-root[data-public-detail-id="permanent-marker"]');const lineage=document.querySelector('#detail-shell .ucd-lineage');return document.getElementById('detail-dialog').open===true && !!root && !!lineage && root.dataset.permanentMarkerLineageCollapsed==='v1'})()`), 'Permanent Marker collapsed lineage ready');
  const permanentMarkerLineage = await evalv(`(()=>{const root=document.querySelector('.detail-public-v1[data-public-detail-id="permanent-marker"],.ucd-root[data-public-detail-id="permanent-marker"]');const shell=document.getElementById('detail-shell');const lineage=shell?.querySelector('.ucd-lineage');const note=lineage?.querySelector(':scope > div > p');const external=shell?.querySelector('[data-lineage-note-v1="true"]');const noteText=note?.textContent?.trim()||'';return {noteText,open:!!lineage?.open,external:!!external,marker:root?.dataset.permanentMarkerLineageCollapsed||'',horizontalOverflow:(root?root.scrollWidth>root.clientWidth+1:true)||(shell?shell.scrollWidth>shell.clientWidth+1:true)}})()`);
  if (!permanentMarkerLineage.noteText.includes('親側のS1／Bx1／F2表記') || !permanentMarkerLineage.noteText.includes('完成したPermanent Marker自体の世代記号')) throw new Error(`Permanent Marker lineage generation note missing: ${JSON.stringify(permanentMarkerLineage)}`);
  if (permanentMarkerLineage.open || permanentMarkerLineage.external || permanentMarkerLineage.marker !== 'v1') throw new Error(`Permanent Marker lineage should start collapsed with note inside: ${JSON.stringify(permanentMarkerLineage)}`);
  if (permanentMarkerLineage.horizontalOverflow) throw new Error('Permanent Marker collapsed lineage causes horizontal overflow');
  await evalv(`document.querySelector('#detail-shell .ucd-lineage > summary').click();true`);
  await waitFor(() => evalv(`document.querySelector('#detail-shell .ucd-lineage')?.open===true`), 'Permanent Marker lineage opens on demand');
  const permanentMarkerOpened = await evalv(`(()=>{const lineage=document.querySelector('#detail-shell .ucd-lineage');const note=lineage?.querySelector(':scope > div > p');return {open:!!lineage?.open,noteVisible:!!note&&getComputedStyle(note).display!=='none'}})()`);
  if (!permanentMarkerOpened.open || !permanentMarkerOpened.noteVisible) throw new Error(`Permanent Marker lineage did not open on demand: ${JSON.stringify(permanentMarkerOpened)}`);

  await cdp.send('Page.navigate', { url: `${baseUrl}?strain=new-caledonia` });
  await waitFor(() => evalv(`document.readyState==='complete'`), 'New Caledonia document complete');
  await waitFor(() => evalv(`document.getElementById('detail-dialog').open===true && document.querySelector('.detail-public-v1[data-public-detail-id="new-caledonia"]') && document.querySelector('.ucd-lineage summary strong')`), 'New Caledonia universal lineage');
  if (await evalv(`!!document.querySelector('#detail-shell [data-lineage-note-v1="true"]')`)) throw new Error('Permanent Marker lineage note leaked to New Caledonia');
  const newCaledonia = await evalv(`(()=>{const root=document.querySelector('.detail-public-v1[data-public-detail-id="new-caledonia"]');const lineage=document.querySelector('.ucd-lineage summary strong')?.textContent?.trim()||'';return {lineage,generic:lineage==='系譜情報',horizontalOverflow:root.scrollWidth>root.clientWidth+1}})()`);
  if (newCaledonia.lineage !== 'New Caledonia系統（P2・サティバ）') throw new Error(`New Caledonia canonical lineage missing: ${JSON.stringify(newCaledonia)}`);
  if (newCaledonia.generic) throw new Error('New Caledonia generic lineage fallback rendered');
  if (newCaledonia.horizontalOverflow) throw new Error('New Caledonia detail has horizontal overflow');

  await cdp.send('Page.navigate', { url: `${baseUrl}?strain=shaman` });
await waitFor(() => evalv(`document.readyState==='complete'`), 'Shaman document complete');
await waitFor(() => evalv(`document.getElementById('detail-dialog').open===true && document.querySelector('.detail-public-v1[data-public-detail-id="shaman"] [data-ucd-tab="morphology"]')`), 'Shaman Morphology presentation');
await evalv(`document.querySelector('.detail-public-v1[data-public-detail-id="shaman"] [data-ucd-tab="morphology"]').click()`);
await waitFor(() => evalv(`(()=>{const root=document.querySelector('.detail-public-v1[data-public-detail-id="shaman"]');const tab=root?.querySelector('[data-ucd-tab="morphology"]');const panel=root?.querySelector('[data-ucd-panel="morphology"]');return tab?.getAttribute('aria-expanded')==='true' && panel && panel.hidden===false && panel.querySelector('[data-morphology-presentation="v1"]')})()`), 'Shaman Morphology panel open');
const shamanMorphology = await evalv(`(()=>{const root=document.querySelector('.detail-public-v1[data-public-detail-id="shaman"]');const panel=root?.querySelector('[data-ucd-panel="morphology"]');const text=panel?.innerText||'';return {text,state:window.__CSWMorphologyPresentationV1||null,horizontalOverflow:root.scrollWidth>root.clientWidth+1}})()`);
if (!shamanMorphology.text.includes('背が高く開いたサティバ寄りの株姿') || !shamanMorphology.text.includes('約半数の表現型')) throw new Error(`Shaman Morphology Japanese summary missing: ${JSON.stringify(shamanMorphology)}`);
if (shamanMorphology.text.includes('tall open sativa structure') || shamanMorphology.text.includes('open branching with long internodes')) throw new Error(`Shaman raw PRIVATE morphology leaked: ${JSON.stringify(shamanMorphology)}`);
if (shamanMorphology.state?.status !== 'PASS' || shamanMorphology.state?.cultivarId !== 'shaman') throw new Error(`Shaman Morphology presentation state invalid: ${JSON.stringify(shamanMorphology.state)}`);
if (shamanMorphology.horizontalOverflow) throw new Error('Shaman Morphology detail has horizontal overflow');

  const flavorCatalog = await getJson(`${baseUrl}runtime/catalog.json`);
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
    flavor = await evalv(`(()=>{const root=document.querySelector('.detail-public-v1[data-public-detail-id="${flavorTarget.id}"]');const panel=root?.querySelector('[data-profile-kind="flavor"]');return {id:${JSON.stringify(flavorTarget.id)},grouped:root?.dataset.cswStagedSensory==='v1',text:panel?.innerText||'',items:[...panel?.querySelectorAll('.ucd-flavor-terms span')||[]].map(n=>({raw:(n.dataset.flavorPublicRaw||n.querySelector('strong')?.textContent||n.textContent||'').trim(),text:(n.textContent||'').trim()})),horizontalOverflow:root.scrollWidth>root.clientWidth+1}})()`);
    for (const item of flavorTarget.flavors.items) if (!flavor.items.some(entry=>entry.raw.toLowerCase()===String(item).trim().toLowerCase())) throw new Error(`Flavor item missing ${item}: ${JSON.stringify(flavor)}`);
    const flavorLabel = flavor.grouped || ['fat-banana-auto','blue-gelato-41'].includes(flavorTarget.id) ? 'フレーバー' : '味わい';
    if (!flavor.text.includes(flavorLabel)) throw new Error(`Flavor Japanese label missing ${flavorLabel}: ${JSON.stringify(flavor)}`);
    if (flavor.horizontalOverflow) throw new Error(`Flavor detail has horizontal overflow: ${JSON.stringify(flavor)}`);
  }

  await cdp.send('Page.navigate', { url: `${baseUrl}?strain=apple-fritter` });
await waitFor(() => evalv(`document.readyState==='complete'`), 'Apple Fritter sensory document complete');
const appleSensory = await waitFor(() => evalv(`(()=>{const root=document.querySelector('.detail-public-v1[data-public-detail-id="apple-fritter"]');if(root?.dataset.sensorySemanticPresentation!=='v1'||root.querySelectorAll('[data-csw-staged-sensory-sub]').length!==3)return false;const children=[...root.querySelectorAll('[data-csw-staged-sensory-sub]')].map(button=>({kind:button.dataset.cswStagedSensorySub,label:button.querySelector('span')?.textContent.trim()||'',helper:button.querySelector('small')?.textContent.trim()||''}));const unknown=['aroma','terpene'].filter(kind=>root.querySelector('[data-ucd-panel="'+kind+'"]')?.dataset.unavailableDetailCard==='v1');return {children,unknown,overflow:root.scrollWidth>root.clientWidth+1}})()`), 'Apple Fritter sensory semantic presentation');
if (JSON.stringify(appleSensory.children)!==JSON.stringify([{kind:'aroma',label:'アロマ',helper:'鼻で感じる香り'},{kind:'flavor',label:'フレーバー',helper:'口に含んだ時に感じる風味'},{kind:'terpene',label:'テルペン',helper:'確認できた成分情報'}])) throw new Error(`Apple Fritter sensory semantics mismatch: ${JSON.stringify(appleSensory)}`);
if (JSON.stringify(appleSensory.unknown)!==JSON.stringify(['aroma','terpene'])) throw new Error(`Apple Fritter UNKNOWN domain mismatch: ${JSON.stringify(appleSensory)}`);
if (appleSensory.overflow) throw new Error('Apple Fritter sensory presentation has horizontal overflow');

  await cdp.send('Page.navigate', { url: `${baseUrl}?strain=blue-gelato-41` });
  await waitFor(() => evalv(`document.readyState==='complete'`), 'Blue Gelato 41 document complete');
  await waitFor(() => evalv(`(()=>{const root=document.querySelector('.detail-public-v1[data-public-detail-id="blue-gelato-41"]');return !!root && root.querySelectorAll('[data-csw-staged-sensory-parent="v1"]').length===1 && root.querySelectorAll('[data-csw-staged-ec-parent="v1"]').length===1})()`), 'Blue Gelato grouped controls');
  const blueTop = await evalv(`(()=>{const root=document.querySelector('.detail-public-v1[data-public-detail-id="blue-gelato-41"]');return [...root.querySelectorAll('.ucd-profile-nav > [data-ucd-tab]')].filter(x=>x.matches('[data-ucd-tab]')&&getComputedStyle(x).display!=='none').map(x=>x.innerText.trim())})()`);
  if (blueTop.filter(x=>x.includes('香味・テルペン')).length!==1 || blueTop.filter(x=>x.includes('効果・栽培')).length!==1) throw new Error(`Blue Gelato top groups mismatch ${JSON.stringify(blueTop)}`);
  if (blueTop.some(x=>['香り','フレーバー','味わい','風味','テルペン'].includes(x))) throw new Error(`Blue Gelato duplicate sensory top control ${JSON.stringify(blueTop)}`);
  await evalv(`document.querySelector('[data-csw-staged-sensory-parent="v1"]').click()`);
  const blueSensoryHelpers = await evalv(`[...document.querySelectorAll('[data-csw-staged-sensory-sub]')].map(button=>({kind:button.dataset.cswStagedSensorySub,label:button.querySelector('span')?.textContent.trim()||'',helper:button.querySelector('small')?.textContent.trim()||''}))`);
  if (JSON.stringify(blueSensoryHelpers)!==JSON.stringify([{kind:'aroma',label:'アロマ',helper:'鼻で感じる香り'},{kind:'flavor',label:'フレーバー',helper:'口に含んだ時に感じる風味'},{kind:'terpene',label:'テルペン',helper:'確認できた成分情報'}])) throw new Error(`Blue Gelato sensory semantics mismatch: ${JSON.stringify(blueSensoryHelpers)}`);
  await evalv(`document.querySelector('[data-csw-staged-sensory-sub="aroma"]').click()`);
  const blueAroma = await waitFor(() => evalv(`(()=>{const p=document.querySelector('[data-profile-kind="aroma"]');if(!p||p.hidden)return false;return [...p.querySelectorAll('[data-aroma-public-term="v1"] strong')].map(x=>x.textContent.trim())})()`), 'Blue Gelato aroma child');
  for (const term of ['Fresh','Fruity','Berry']) if (!blueAroma.includes(term)) throw new Error(`Blue Gelato Aroma missing ${term}: ${JSON.stringify(blueAroma)}`);
  await evalv(`document.querySelector('[data-csw-staged-sensory-sub="flavor"]').click()`);
  const blueFlavor = await waitFor(() => evalv(`(()=>{const p=document.querySelector('[data-profile-kind="flavor"]');if(!p||p.hidden)return false;return {text:p.innerText,items:[...p.querySelectorAll('.ucd-flavor-terms span')].map(x=>x.textContent.trim())}})()`), 'Blue Gelato flavor child');
  for (const term of ['スイート','アーシー','シトラス']) if (!blueFlavor.items.includes(term)) throw new Error(`Blue Gelato Flavor missing ${term}: ${JSON.stringify(blueFlavor)}`);
  if(!blueFlavor.text.includes('フレーバー')) throw new Error('Blue Gelato Flavor label not normalized');
  const blueTerpeneState = await evalv(`(()=>{
    const button=document.querySelector('[data-csw-staged-sensory-sub="terpene"]');
    const panel=document.querySelector('[data-profile-kind="terpene"]');
    const chevron=button?.querySelector(':scope > i');
    const verification=document.querySelector('[data-csw-verification-kind="terpene"]');
    return {
      state:button?.dataset.cswDetailState||'',
      ariaDisabled:button?.getAttribute('aria-disabled')||'',
      tabIndex:button?.getAttribute('tabindex')||'',
      disabled:button?.disabled===true,
      pointerEvents:button?getComputedStyle(button).pointerEvents:'',
      chevronVisible:!!chevron&&getComputedStyle(chevron).display!=='none',
      panelHidden:panel?.hidden===true,
      message:panel?.textContent||'',
      verification:verification?.textContent||''
    };
  })()`);
  if(blueTerpeneState.state!=='inactive'||blueTerpeneState.ariaDisabled!=='true'||blueTerpeneState.tabIndex!=='-1'||!blueTerpeneState.disabled||blueTerpeneState.pointerEvents!=='none'||blueTerpeneState.chevronVisible||!blueTerpeneState.panelHidden) throw new Error(`Blue Gelato UNKNOWN terpene should be inactive: ${JSON.stringify(blueTerpeneState)}`);
  if(!blueTerpeneState.message.includes('個別テルペンは確認できていません')||!blueTerpeneState.verification.includes('テルペン：未確認')) throw new Error(`Blue Gelato UNKNOWN terpene reason missing: ${JSON.stringify(blueTerpeneState)}`);
  await evalv(`document.querySelector('[data-csw-staged-sensory-sub="terpene"]').click();true`);
  const blueTerpeneStayedClosed = await evalv(`document.querySelector('[data-profile-kind="terpene"]')?.hidden===true`);
  if(!blueTerpeneStayedClosed) throw new Error('Blue Gelato inactive terpene opened after click');
  await evalv(`document.querySelector('[data-csw-staged-ec-parent="v1"]').click()`);
  await evalv(`document.querySelector('[data-csw-staged-ec-sub="effects"]').click()`);
  const blueEffects = await waitFor(() => evalv(`(()=>{const s=document.querySelector('[data-csw-staged-ec-section="effects"]');if(!s||s.hidden)return false;return [...s.querySelectorAll('.csw-staged-effect-terms span')].map(x=>x.textContent.trim())})()`), 'Blue Gelato effects child');
  for (const term of ['頭がクリア','活力','創造的']) if (!blueEffects.includes(term)) throw new Error(`Blue Gelato Effect missing ${term}: ${JSON.stringify(blueEffects)}`);
  await evalv(`document.querySelector('[data-csw-staged-ec-sub="cultivation"]').click()`);
  const blueCultivation = await waitFor(() => evalv(`(()=>{const s=document.querySelector('[data-csw-staged-ec-section="cultivation"]');if(!s||s.hidden)return false;return {labels:[...s.querySelectorAll('.csw-staged-cultivation-row small')].map(x=>x.textContent.trim()),values:[...s.querySelectorAll('.csw-staged-cultivation-value')].map(x=>x.textContent.trim())}})()`), 'Blue Gelato cultivation child');
  for (const value of ['110〜150 cm','700〜800 g/m²','63〜70日','150〜200 cm','2500〜3000 g/株','10月 第2〜第3週']) if (!blueCultivation.values.includes(value)) throw new Error(`Blue Gelato cultivation missing ${value}: ${JSON.stringify(blueCultivation)}`);
  if(!blueCultivation.labels.includes('収穫時期')) throw new Error(`Blue Gelato harvest label missing: ${JSON.stringify(blueCultivation.labels)}`);
  const blueOverflow = await evalv(`(()=>{const r=document.querySelector('.detail-public-v1[data-public-detail-id="blue-gelato-41"]');return r.scrollWidth>r.clientWidth+1||document.documentElement.scrollWidth>document.documentElement.clientWidth+1})()`);
  if(blueOverflow) throw new Error('Blue Gelato detail has horizontal overflow');

  const childRelationshipCases = [
    { parentId: 'acapulco-gold', childIds: ['skunk-1'] },
    { parentId: 'ak-47', childIds: ['serious-happiness'] },
    { parentId: 'warlock', childIds: ['serious-happiness'] },
    { parentId: 'papaya', childIds: ['california-octane'] },
    { parentId: 'skunk-1', childIds: ['mazar', 'sensi-skunk', 'shiva-skunk', 'super-skunk'] },
    { parentId: 'super-skunk', childIds: ['sour-diesel'] },
    { parentId: 'sunset-sherbert', childIds: ['blue-gelato-41'] },
    { parentId: 'og-kush', childIds: ['cataract-kush'] },
    { parentId: 'ogkb', childIds: ['do-si-dos'] },
    { parentId: 'face-off-og-bx1', childIds: ['do-si-dos'] },
    { parentId: 'chem-d', childIds: ['gmo-cookies'] },
    { parentId: 'forum-gsc', childIds: ['gmo-cookies'] },
    { parentId: 'gelato-33', childIds: ['ice-cream-cake', 'lemon-cherry-gelato'] }
  ];
  const childRelationshipResults = [];
  for (const testCase of childRelationshipCases) {
    await cdp.send('Page.navigate', { url: `${baseUrl}?strain=${encodeURIComponent(testCase.parentId)}` });
    await waitFor(() => evalv(`document.readyState==='complete'`), `${testCase.parentId} relationship document complete`);
    await waitFor(() => evalv(`(()=>{
      const root=document.querySelector('.detail-public-v1[data-public-detail-id="${testCase.parentId}"],.ucd-root[data-public-detail-id="${testCase.parentId}"]');
      const lineage=document.querySelector('#detail-shell .ucd-lineage');
      const rows=[...lineage?.querySelectorAll('[data-child-relationship]')||[]];
      return root?.dataset.sitewideLineageRelationships==='v1' && rows.length===${testCase.childIds.length};
    })()`), `${testCase.parentId} child relationships rendered`);
    const relationshipState = await evalv(`(()=>{
      const root=document.querySelector('.detail-public-v1[data-public-detail-id="${testCase.parentId}"],.ucd-root[data-public-detail-id="${testCase.parentId}"]');
      const lineage=document.querySelector('#detail-shell .ucd-lineage');
      const body=lineage?.querySelector(':scope > div');
      const rows=[...lineage?.querySelectorAll('[data-child-relationship]')||[]].map(row=>({
        id:row.dataset.childRelationship,
        name:row.querySelector('.csw-name-rel-name')?.textContent.trim()||'',
        lineage:row.querySelector('.csw-name-rel-lineage')?.textContent.trim()||'',
        label:row.querySelector('.csw-name-rel-label')?.textContent.replace(/\\s+/g,' ').trim()||''
      }));
      const evidence=body?.querySelector(':scope > .ucd-evidence-row');
      return {
        rows,
        state:window.__CSWSitewideLineageRelationshipsV1||null,
        evidenceLast:!!body&&(!evidence||body.lastElementChild===evidence),
        overflow:(root?root.scrollWidth>root.clientWidth+1:true)||(document.getElementById('detail-shell')?.scrollWidth>document.getElementById('detail-shell')?.clientWidth+1)
      };
    })()`);
    const actualIds = relationshipState.rows.map(row=>row.id);
    if (JSON.stringify(actualIds)!==JSON.stringify(testCase.childIds)) throw new Error(`${testCase.parentId} child IDs mismatch: ${JSON.stringify(relationshipState)}`);
    if (relationshipState.rows.some(row=>!row.name||!row.lineage||!row.label.includes('子系統')||!row.label.includes('CHILD LINE'))) throw new Error(`${testCase.parentId} child relationship content invalid: ${JSON.stringify(relationshipState)}`);
    if (relationshipState.state?.status!=='PASS'||relationshipState.state?.cultivarId!==testCase.parentId||relationshipState.state?.childCount!==testCase.childIds.length) throw new Error(`${testCase.parentId} relationship state invalid: ${JSON.stringify(relationshipState)}`);
    if (!relationshipState.evidenceLast) throw new Error(`${testCase.parentId} lineage evidence footer not last`);
    if (relationshipState.overflow) throw new Error(`${testCase.parentId} child relationship overflow`);
    childRelationshipResults.push({parentId:testCase.parentId,childIds:actualIds});
  }

  await cdp.send('Page.navigate', { url: `${baseUrl}?strain=og-kush` });
  await waitFor(() => evalv(`document.readyState==='complete'`), 'OG Kush selection document complete');
  await waitFor(() => evalv(`(()=>{
    const root=document.querySelector('.detail-public-v1[data-public-detail-id="og-kush"],.ucd-root[data-public-detail-id="og-kush"]');
    const lineage=document.querySelector('#detail-shell .ucd-lineage');
    return root?.dataset.sitewideLineageRelationships==='v1' && lineage?.querySelectorAll('[data-selection-relationship="the-og-18"]').length===1;
  })()`), 'OG Kush selection relationship rendered');
  const ogRelationshipState = await evalv(`(()=>{
    const root=document.querySelector('.detail-public-v1[data-public-detail-id="og-kush"],.ucd-root[data-public-detail-id="og-kush"]');
    const lineage=document.querySelector('#detail-shell .ucd-lineage');
    const body=lineage?.querySelector(':scope > div');
    const childRows=[...lineage?.querySelectorAll('[data-child-relationship]')||[]].map(row=>row.dataset.childRelationship);
    const selectionRows=[...lineage?.querySelectorAll('[data-selection-relationship]')||[]].map(row=>({
      id:row.dataset.selectionRelationship,
      name:row.querySelector('.csw-name-rel-name')?.textContent.trim()||'',
      relationship:row.querySelector('.csw-name-rel-lineage')?.textContent.trim()||'',
      label:row.querySelector('.csw-name-rel-label')?.textContent.replace(/\\s+/g,' ').trim()||''
    }));
    const evidence=body?.querySelector(':scope > .ucd-evidence-row');
    return {
      childRows,
      selectionRows,
      state:window.__CSWSitewideLineageRelationshipsV1||null,
      evidenceLast:!!body&&body.lastElementChild===evidence,
      overflow:(root?root.scrollWidth>root.clientWidth+1:true)||(document.getElementById('detail-shell')?.scrollWidth>document.getElementById('detail-shell')?.clientWidth+1)
    };
  })()`);
  if (JSON.stringify(ogRelationshipState.childRows)!==JSON.stringify(['cataract-kush'])) throw new Error(`OG Kush CHILD LINE must contain only Cataract Kush: ${JSON.stringify(ogRelationshipState)}`);
  if (ogRelationshipState.selectionRows.length!==1) throw new Error(`OG Kush selection row count invalid: ${JSON.stringify(ogRelationshipState)}`);
  const ogSelection=ogRelationshipState.selectionRows[0];
  if (ogSelection.id!=='the-og-18'||ogSelection.name!=='The OG #18'||!ogSelection.relationship||!ogSelection.label.includes('選抜系統')||!ogSelection.label.includes('SELECTION')) throw new Error(`OG Kush selection relationship content invalid: ${JSON.stringify(ogRelationshipState)}`);
  if (/\\b(?:S1|BX)\\b/i.test(ogSelection.relationship)||/\\b(?:S1|BX)\\b/i.test(ogSelection.label)) throw new Error(`The OG #18 selection rail must not resolve the S1/BX generation conflict: ${JSON.stringify(ogRelationshipState)}`);
  if (ogRelationshipState.state?.status!=='PASS'||ogRelationshipState.state?.cultivarId!=='og-kush'||ogRelationshipState.state?.childCount!==1||ogRelationshipState.state?.selectionCount!==1) throw new Error(`OG Kush typed relationship state invalid: ${JSON.stringify(ogRelationshipState)}`);
  if (!ogRelationshipState.evidenceLast) throw new Error('OG Kush lineage evidence footer not last');
  if (ogRelationshipState.overflow) throw new Error('OG Kush typed relationship presentation overflow');

  const runtimeErrors = cdp.events.filter(event => event.method === 'Runtime.exceptionThrown');
  if (runtimeErrors.length) throw new Error(`Runtime exceptions: ${JSON.stringify(runtimeErrors.slice(0, 3))}`);

  console.log(JSON.stringify({status:'PASS',initial,searchCount,sativaCount,generation,generationCount,cbdCount,breeder,breederCount,latestId,latestTitle,allId,allTitle,autoCollapsed,autoExpanded,rush,newCaledonia,childRelationshipResults,ogRelationshipState,runtimeErrors:0}, null, 2));
  cdp.close();
}

try { await main(); }
catch (error) { console.error('CSW_BROWSER_SMOKE_FAIL', error.stack || error); console.error(stderr.slice(-3000)); process.exitCode = 1; }
finally { try { proc.kill('SIGTERM'); } catch {} await sleep(100); try { fs.rmSync(profile, { recursive: true, force: true }); } catch {} }
