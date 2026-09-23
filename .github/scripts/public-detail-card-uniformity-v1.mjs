import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.env.CSW_BASE_URL || 'http://127.0.0.1:4173/';
const chrome = process.env.CHROME_BIN;
const screenshotDir = String(process.env.CSW_SCREENSHOT_DIR || '').trim();
if (!chrome) throw new Error('CHROME_BIN is required');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'csw-card-uniformity-'));
const proc = spawn(chrome, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--remote-debugging-port=9223', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function getJson(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${url} HTTP ${r.status}`); return r.json(); }
async function waitFor(fn, label, timeout = 15000) {
  const started = Date.now(); let last;
  while (Date.now() - started < timeout) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e; }
    await sleep(100);
  }
  throw new Error(`Timeout waiting for ${label}${last instanceof Error ? `: ${last.message}` : ''}`);
}
class CDP {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.exceptions = []; }
  async open() {
    await new Promise((resolve, reject) => { this.ws.addEventListener('open', resolve, { once: true }); this.ws.addEventListener('error', reject, { once: true }); });
    this.ws.addEventListener('message', event => {
      const m = JSON.parse(event.data);
      if (m.id) { const p = this.pending.get(m.id); if (!p) return; this.pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
      else if (m.method === 'Runtime.exceptionThrown') this.exceptions.push(m);
    });
  }
  send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  close() { this.ws.close(); }
}

async function main() {
  await waitFor(async () => { try { return await getJson('http://127.0.0.1:9223/json/version'); } catch { return false; } }, 'Chrome DevTools');
  const pages = await getJson('http://127.0.0.1:9223/json/list');
  const page = pages.find(item => item.type === 'page'); if (!page) throw new Error('No Chrome page target');
  const cdp = new CDP(page.webSocketDebuggerUrl); await cdp.open(); await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  async function evalv(expression) {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`Eval exception: ${r.exceptionDetails.text}`);
    return r.result.value;
  }
  const catalog = await getJson(new URL('runtime/catalog.json', baseUrl));
  const ids = (catalog.cultivars || []).map(item => item.id);
  if (!ids.length) throw new Error('Expected at least one public cultivar');
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate public cultivar IDs in catalog');
  const failures = [];
  for (const id of ids) {
    cdp.exceptions.length = 0;
    await cdp.send('Page.navigate', { url: `${baseUrl}?strain=${encodeURIComponent(id)}` });
    await waitFor(() => evalv(`document.readyState==='complete'`), `${id} document`);
    await waitFor(() => evalv(`(()=>{const r=document.querySelector('.detail-public-v1[data-public-detail-id=${JSON.stringify(id)}],.ucd-root[data-public-detail-id=${JSON.stringify(id)}]');return !!r&&r.dataset.fixedDetailCardsV1==='true'&&r.dataset.fixedPrimaryCardsV1==='true'&&r.dataset.fixedLineageCardV1==='true'})()`), `${id} fixed detail cards`, 20000);
    const expectedSensoryCount=2+(['confirmed','disputed'].includes((catalog.cultivars||[]).find(item=>item.id===id)?.flavors?.status)&&Array.isArray((catalog.cultivars||[]).find(item=>item.id===id)?.flavors?.items)&&(catalog.cultivars||[]).find(item=>item.id===id).flavors.items.length>0?1:0);
    await waitFor(() => evalv(`document.querySelector('.detail-public-v1[data-public-detail-id=${JSON.stringify(id)}],.ucd-root[data-public-detail-id=${JSON.stringify(id)}]')?.querySelectorAll('[data-csw-staged-sensory-sub]').length===${expectedSensoryCount}`), `${id} sensory domain reconciliation`, 20000);
    const state = await evalv(`(()=>{const r=document.querySelector('.detail-public-v1[data-public-detail-id=${JSON.stringify(id)}],.ucd-root[data-public-detail-id=${JSON.stringify(id)}]');return {lineage:!!document.querySelector('#detail-shell .ucd-lineage'),type:!!r?.querySelector('[data-ucd-primary-tab="type"]'),cannabinoid:!!r?.querySelector('[data-ucd-primary-tab="cannabinoid"]'),aroma:!!r?.querySelector('[data-ucd-tab="aroma"]'),terpene:!!r?.querySelector('[data-ucd-tab="terpene"]'),morphology:!!r?.querySelector('[data-ucd-tab="morphology"]'),originHistory:!!r?.querySelector('[data-ucd-tab="origin-history"]'),flavor:${JSON.stringify(id)}!=='apple-fritter'||!!r?.querySelector('[data-ucd-tab="flavor"]'),overflow:r?r.scrollWidth>r.clientWidth+1:true}})()`);
    const missing = Object.entries(state).filter(([key, value]) => key !== 'overflow' && !value).map(([key]) => key);
    if (state.overflow) missing.push('horizontalOverflow');
    if (cdp.exceptions.length) missing.push(`runtimeExceptions:${cdp.exceptions.length}`);
    if (missing.length) failures.push({ id, missing, state });
  }
  if (failures.length) throw new Error(`UNIFORM_DETAIL_CARD_FAILURES ${JSON.stringify(failures)}`);

  const structures = {};
  for (const id of ids) {
    cdp.exceptions.length = 0;
    await cdp.send('Page.navigate', { url: `${baseUrl}?strain=${encodeURIComponent(id)}` });
    await waitFor(() => evalv(`document.readyState==='complete'`), `${id} structure document`);
    await waitFor(() => evalv(`(()=>{const r=document.querySelector('.detail-public-v1[data-public-detail-id=${JSON.stringify(id)}],.ucd-root[data-public-detail-id=${JSON.stringify(id)}]');return !!r&&r.dataset.fixedDetailCardsV1==='true'&&r.dataset.fixedPrimaryCardsV1==='true'&&r.dataset.fixedLineageCardV1==='true'&&r.dataset.stagedSensoryGroup==='v1'&&r.dataset.cswStagedEffectCultivation==='v1'})()`), `${id} universal grouping markers`, 20000);
    const expectedSensoryCount=2+(['confirmed','disputed'].includes((catalog.cultivars||[]).find(item=>item.id===id)?.flavors?.status)&&Array.isArray((catalog.cultivars||[]).find(item=>item.id===id)?.flavors?.items)&&(catalog.cultivars||[]).find(item=>item.id===id).flavors.items.length>0?1:0);
    await waitFor(() => evalv(`document.querySelector('.detail-public-v1[data-public-detail-id=${JSON.stringify(id)}],.ucd-root[data-public-detail-id=${JSON.stringify(id)}]')?.querySelectorAll('[data-csw-staged-sensory-sub]').length===${expectedSensoryCount}`), `${id} strict sensory domain reconciliation`, 20000);
    structures[id] = await evalv(`(()=>{
      const root=document.querySelector('.detail-public-v1[data-public-detail-id=${JSON.stringify(id)}],.ucd-root[data-public-detail-id=${JSON.stringify(id)}]');
      const nav=root.querySelector('.ucd-profile-nav');
      const visible=[...nav.querySelectorAll(':scope > [data-ucd-tab]')].filter(button=>getComputedStyle(button).display!=='none');
      const rects=visible.map(button=>{const rect=button.getBoundingClientRect();return {label:button.querySelector('span')?.textContent.trim()||'',x:rect.x,y:rect.y,width:rect.width,height:rect.height}});
      const firstStyle=getComputedStyle(visible[0]);
      const unknownKinds=['aroma','terpene','morphology','origin-history'].filter(kind=>[...root.querySelectorAll('[data-ucd-panel="'+kind+'"]')].some(panel=>{const box=panel.querySelector('.ucd-data-unavailable,.ucd-terpene-unavailable');return !!box&&!!box.querySelector('strong')&&/確認できていません/.test(box.textContent||'')}));
      const ecUnknown=[...root.querySelectorAll('[data-csw-staged-ec-unknown]')].map(section=>section.dataset.cswStagedEcUnknown).sort();
      const flavorPanel=[...root.querySelectorAll('[data-profile-kind="flavor"],[data-ucd-panel="flavor"]')].find(panel=>panel.querySelector('[data-flavor-presentation="v1"]'));
      const flavorTerms=[...flavorPanel?.querySelectorAll('[data-flavor-public-term="v1"]')||[]].map(node=>({raw:(node.dataset.flavorPublicRaw||'').trim(),gloss:(node.querySelector('small')?.textContent||'').trim()}));
      const sources=root.querySelector('.ucd-sources');
      const sensoryChildren=[...root.querySelectorAll('[data-csw-staged-sensory-sub]')].map(button=>({kind:button.dataset.cswStagedSensorySub,label:button.querySelector('span')?.textContent.trim()||'',helper:button.querySelector('small')?.textContent.trim()||'',helperMarker:button.dataset.cswSensoryHelper||'',ariaLabel:button.getAttribute('aria-label')||'',state:button.dataset.cswDetailState||'',ariaDisabled:button.getAttribute('aria-disabled')||'',disabled:button.disabled===true,pointerEvents:getComputedStyle(button).pointerEvents,chevronVisible:!!button.querySelector(':scope > i')&&getComputedStyle(button.querySelector(':scope > i')).display!=='none'}));
      const sensoryInteractions=sensoryChildren.map(({kind})=>{
        const button=root.querySelector('[data-csw-staged-sensory-sub="'+kind+'"]');
        button.click();
        const candidates=[...root.querySelectorAll('[data-profile-kind="'+kind+'"],[data-ucd-panel="'+kind+'"]')];
        const panel=kind==='flavor'?(candidates.find(item=>item.querySelector('[data-flavor-presentation="v1"]'))||candidates[0]):candidates[0];
        const otherVisible=[...root.querySelectorAll('[data-profile-kind="flavor"],[data-profile-kind="aroma"],[data-profile-kind="terpene"]')].filter(item=>item!==panel&&!item.hidden).map(item=>item.dataset.profileKind||item.dataset.ucdPanel||'unknown');
        return {kind,state:button.dataset.cswDetailState||'',pressed:button.getAttribute('aria-pressed')==='true',panelKind:panel?.dataset.profileKind||panel?.dataset.ucdPanel||'',panelVisible:!!panel&&!panel.hidden,otherVisible};
      });
      const sensoryPanelLabels=Object.fromEntries(['flavor','aroma','terpene'].map(kind=>{const candidates=[...root.querySelectorAll('[data-profile-kind="'+kind+'"],[data-ucd-panel="'+kind+'"]')];const panel=kind==='flavor'?(candidates.find(item=>item.querySelector('[data-flavor-presentation="v1"]'))||candidates[0]):candidates[0];return [kind,panel?.getAttribute('aria-label')||panel?.querySelector('.ucd-sensory-head span,.ucd-data-unavailable > small')?.textContent.trim()||'']}));
      return {
        viewport:{width:innerWidth,height:innerHeight},
        labels:rects.map(item=>item.label),rects,
        columns:getComputedStyle(nav).gridTemplateColumns.split(/\\s+/).filter(Boolean).length,
        navGap:getComputedStyle(nav).gap,
        buttonStyle:{minHeight:firstStyle.minHeight,padding:firstStyle.padding,fontSize:firstStyle.fontSize,whiteSpace:firstStyle.whiteSpace},
        oldStandaloneVisible:rects.filter(item=>['味わい','風味','香り','テルペン'].includes(item.label)).map(item=>item.label),positioningTopLevel:!!nav.querySelector(':scope > [data-ucd-tab=\"positioning\"]'),positioningIntegrated:!!root.querySelector('[data-ucd-panel=\"origin-history\"] [data-csw-positioning-section=\"v1\"]'),
        sensorySemanticMarker:root.dataset.sensorySemanticPresentation||'',sensoryChildren,sensoryInteractions,sensoryPanelLabels,unknownKinds,ecUnknown,flavorTerms,
        flavorMarker:root.dataset.appleFritterFlavorBilingual||root.dataset.mimosaFlavorBilingual||'',
        effectSections:[...root.querySelectorAll('[data-csw-staged-ec-section]')].map(section=>section.dataset.cswStagedEcSection).sort(),
        sources:{present:!!sources,summary:sources?.querySelector('summary')?.innerText.trim()||'',count:sources?.querySelectorAll(':scope > div > a').length||0},
        overflow:root.scrollWidth>root.clientWidth+1||document.documentElement.scrollWidth>document.documentElement.clientWidth+1,
      };
    })()`);

    if (screenshotDir) {
      fs.mkdirSync(screenshotDir, { recursive: true });
      await evalv(`(()=>{const dialog=document.getElementById('detail-dialog'),nav=document.querySelector('.detail-public-v1[data-public-detail-id=${JSON.stringify(id)}] .ucd-profile-nav');if(!(dialog&&nav))return false;dialog.scrollTop=Math.max(0,dialog.scrollTop+nav.getBoundingClientRect().top-120);return true})()`);
      await sleep(100);
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
      fs.writeFileSync(path.join(screenshotDir, `${id}-390-grouped.png`), Buffer.from(shot.data, 'base64'));
    }
    if (cdp.exceptions.length) throw new Error(`${id} structure runtime exceptions: ${cdp.exceptions.length}`);
  }

  const expectedLabels = ['香味・テルペン','効果・栽培','形態','起源と歴史'];
  for (const [id, state] of Object.entries(structures)) {
    const cultivar=(catalog.cultivars||[]).find(item=>item.id===id);
    if (state.viewport.width !== 390) throw new Error(`${id} viewport is not 390px: ${JSON.stringify(state.viewport)}`);
    if (JSON.stringify(state.labels) !== JSON.stringify(expectedLabels)) throw new Error(`${id} grouped labels mismatch: ${JSON.stringify(state.labels)}`);
    if (state.columns !== 2) throw new Error(`${id} grouped cards are not two columns: ${JSON.stringify(state)}`);
    if (!(Math.abs(state.rects[0].y-state.rects[1].y)<1&&state.rects[2].y>state.rects[0].y&&Math.abs(state.rects[2].y-state.rects[3].y)<1)) throw new Error(`${id} grouped card wrapping mismatch: ${JSON.stringify(state.rects)}`);
    if (state.oldStandaloneVisible.length) throw new Error(`${id} legacy standalone sensory cards remain visible: ${JSON.stringify(state.oldStandaloneVisible)}`);
    if (state.sensorySemanticMarker !== 'v1') throw new Error(`${id} sensory semantic marker missing`);
    const helperSpec={flavor:{label:'フレーバー',helper:'口に含んだ時に感じる風味'},aroma:{label:'アロマ',helper:'鼻で感じる香り'},terpene:{label:'テルペン',helper:'確認できた成分情報'}};
    const flavorSupported=['confirmed','disputed'].includes(cultivar?.flavors?.status)&&Array.isArray(cultivar?.flavors?.items)&&cultivar.flavors.items.length>0;
    const expectedSensoryKinds=['aroma',...(flavorSupported?['flavor']:[]),'terpene'];
    if (JSON.stringify(state.sensoryChildren.map(item=>item.kind)) !== JSON.stringify(expectedSensoryKinds)) throw new Error(`${id} sensory domain order mismatch: ${JSON.stringify(state.sensoryChildren)}`);
    for (const item of state.sensoryChildren) {
      const spec=helperSpec[item.kind];
      if (!spec||item.label!==spec.label||item.helper!==spec.helper||item.helperMarker!==spec.helper) throw new Error(`${id} sensory helper mismatch: ${JSON.stringify(item)}`);
      if (item.state==='inactive') {
        if (item.ariaLabel!==`${spec.label}：未確認`||item.ariaDisabled!=='true'||!item.disabled||item.pointerEvents!=='none'||item.chevronVisible) throw new Error(`${id} inactive sensory contract mismatch: ${JSON.stringify(item)}`);
      } else if (item.state==='active') {
        if (item.ariaLabel!==`${spec.label}：${spec.helper}`||item.ariaDisabled!=='false'||item.disabled||item.pointerEvents==='none') throw new Error(`${id} active sensory contract mismatch: ${JSON.stringify(item)}`);
      } else {
        throw new Error(`${id} sensory state missing: ${JSON.stringify(item)}`);
      }
    }
    for (const interaction of state.sensoryInteractions) {
      if (interaction.state==='inactive') {
        if (interaction.pressed||interaction.panelVisible) throw new Error(`${id} inactive sensory opened: ${JSON.stringify(interaction)}`);
      } else if (!interaction.pressed||!interaction.panelVisible||interaction.panelKind!==interaction.kind||interaction.otherVisible.length) {
        throw new Error(`${id} cross-domain sensory interaction mismatch: ${JSON.stringify(interaction)}`);
      }
    }
    if (flavorSupported && !/フレーバー/.test(state.sensoryPanelLabels.flavor)) throw new Error(`${id} Flavor panel label mismatch: ${state.sensoryPanelLabels.flavor}`);
    if (!/アロマ/.test(state.sensoryPanelLabels.aroma)) throw new Error(`${id} Aroma panel label mismatch: ${state.sensoryPanelLabels.aroma}`);
    if (!/テルペン/.test(state.sensoryPanelLabels.terpene)) throw new Error(`${id} Terpene panel label mismatch: ${state.sensoryPanelLabels.terpene}`);
    if (cultivar?.aromas?.status==='unknown'&&!state.unknownKinds.includes('aroma')) throw new Error(`${id} Aroma UNKNOWN lost`);
    if (cultivar?.terpenes?.status==='unknown'&&!state.unknownKinds.includes('terpene')) throw new Error(`${id} Terpene UNKNOWN lost`);
    if (state.positioningTopLevel) throw new Error(`${id} standalone positioning card remains visible`);
    if (['confirmed','disputed'].includes(cultivar?.positioning?.status)&&!state.positioningIntegrated) throw new Error(`${id} positioning content was not integrated`);
    if (state.effectSections.join(',') !== 'cultivation,effects') throw new Error(`${id} effect/cultivation shell mismatch: ${JSON.stringify(state.effectSections)}`);
    if (!state.sources.present || !state.sources.summary || state.sources.count<1) throw new Error(`${id} sources grouping mismatch: ${JSON.stringify(state.sources)}`);
    if (state.overflow) throw new Error(`${id} has 390px horizontal overflow`);
  }
  const mimosa = structures.mimosa;
  const apple = structures['apple-fritter'];
  if (JSON.stringify(apple.unknownKinds) !== JSON.stringify(['aroma','terpene','morphology','origin-history'])) throw new Error(`Apple Fritter UNKNOWN detail shell mismatch: ${JSON.stringify(apple.unknownKinds)}`);
  if (JSON.stringify(apple.sensoryChildren.map(item=>item.kind)) !== JSON.stringify(['aroma','flavor','terpene'])) throw new Error(`Apple Fritter sensory domains mismatch: ${JSON.stringify(apple.sensoryChildren)}`);
  if (JSON.stringify(apple.ecUnknown) !== JSON.stringify(['cultivation','effects'])) throw new Error(`Apple Fritter UNKNOWN effect/cultivation shell mismatch: ${JSON.stringify(apple.ecUnknown)}`);
  if (mimosa.ecUnknown.length) throw new Error(`Mimosa effect/cultivation regressed to UNKNOWN: ${JSON.stringify(mimosa.ecUnknown)}`);
  for (const key of ['navGap','buttonStyle']) if (JSON.stringify(apple[key]) !== JSON.stringify(mimosa[key])) throw new Error(`Apple Fritter ${key} differs from Mimosa: ${JSON.stringify({apple:apple[key],mimosa:mimosa[key]})}`);
  cdp.close();
  console.log(`SENSORY SEMANTIC PRESENTATION PASS ${ids.length}/${ids.length}; UNIVERSAL 390PX GROUPING PASS; CROSS-DOMAIN MIGRATION 0`);
}

try { await main(); }
finally {
  proc.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => { if (proc.exitCode !== null) resolve(); else proc.once('exit', resolve); }),
    sleep(2000),
  ]);
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
}
