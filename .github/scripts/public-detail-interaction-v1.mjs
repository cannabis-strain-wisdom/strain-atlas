import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.env.CSW_BASE_URL || 'http://127.0.0.1:4173/';
const chrome = process.env.CHROME_BIN;
if (!chrome) throw new Error('CHROME_BIN is required');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function getJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
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
        message.error ? pending.reject(new Error(JSON.stringify(message.error))) : pending.resolve(message.result);
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

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'csw-detail-interaction-'));
const proc = spawn(chrome, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--remote-debugging-port=9225',
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
proc.stderr.on('data', data => { stderr += String(data); });

async function main() {
  await waitFor(async () => {
    try { return await getJson('http://127.0.0.1:9225/json/version'); }
    catch { return false; }
  }, 'Chrome DevTools');
  const pages = await getJson('http://127.0.0.1:9225/json/list');
  const page = pages.find(item => item.type === 'page');
  if (!page) throw new Error('No Chrome page target');

  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  async function evalv(expression) {
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(`Eval exception: ${result.exceptionDetails.text}`);
    return result.result.value;
  }

  async function navigate(id) {
    const url = new URL(baseUrl);
    url.searchParams.set('strain', id);
    await cdp.send('Page.navigate', { url: url.href });
    await waitFor(() => evalv(`document.readyState==='complete'`), `${id} document complete`);
    await waitFor(() => evalv(`(()=>{const root=document.querySelector('.detail-public-v1[data-public-detail-id="${id}"],.ucd-root[data-public-detail-id="${id}"]');return !!root && root.dataset.cswDetailInteraction==='v1' && window.__CSWDetailInteractionV1?.status==='PASS'})()`), `${id} interaction decoration`);
  }

  const readSensory = id => evalv(`(()=>{
    const root=document.querySelector('.detail-public-v1[data-public-detail-id="${id}"],.ucd-root[data-public-detail-id="${id}"]');
    const buttons=[...root.querySelectorAll('[data-csw-staged-sensory-sub]')].map(button=>({
      kind:button.dataset.cswStagedSensorySub||'',
      state:button.dataset.cswDetailState||'',
      ariaDisabled:button.getAttribute('aria-disabled'),
      tabIndex:button.getAttribute('tabindex'),
      pointerEvents:getComputedStyle(button).pointerEvents,
      helperDisplay:button.querySelector('small')?getComputedStyle(button.querySelector('small')).display:null,
      helperText:button.querySelector('small')?.textContent.trim()||'',
      ariaLabel:button.getAttribute('aria-label')||''
    }));
    const verification=root.querySelector('[data-csw-verification-status="v1"]');
    const sources=root.querySelector('.ucd-sources');
    const reasons=verification?[...verification.querySelectorAll('[data-csw-verification-kind]')].map(row=>({
      kind:row.dataset.cswVerificationKind||'',
      title:row.querySelector('strong')?.textContent.trim()||'',
      reason:row.querySelector('p')?.textContent.trim()||''
    })):[];
    return {
      buttons,
      verificationExists:!!verification,
      verificationOpen:verification?.open??null,
      verificationBeforeSources:!!verification&&!!sources&&verification.nextElementSibling===sources,
      reasons,
      state:window.__CSWDetailInteractionV1||null,
      overflow:root.scrollWidth>root.clientWidth+1||document.documentElement.scrollWidth>document.documentElement.clientWidth+1
    };
  })()`);

  await navigate('apple-fritter');
  const apple = await readSensory('apple-fritter');
  const appleByKind = Object.fromEntries(apple.buttons.map(item => [item.kind, item]));
  for (const kind of ['aroma','terpene']) {
    const item = appleByKind[kind];
    if (!item || item.state !== 'inactive' || item.ariaDisabled !== 'true' || item.tabIndex !== '-1' || item.pointerEvents !== 'none') {
      throw new Error(`Apple Fritter ${kind} inactive semantics mismatch: ${JSON.stringify(item)}`);
    }
    if (item.helperDisplay !== 'none' || !item.helperText) throw new Error(`Apple Fritter ${kind} helper presentation mismatch: ${JSON.stringify(item)}`);
  }
  const appleFlavor = appleByKind.flavor;
  if (!appleFlavor || appleFlavor.state !== 'active' || appleFlavor.ariaDisabled !== 'false' || appleFlavor.pointerEvents === 'none') {
    throw new Error(`Apple Fritter flavor active semantics mismatch: ${JSON.stringify(appleFlavor)}`);
  }
  if (appleFlavor.helperDisplay !== 'none' || !appleFlavor.helperText) throw new Error(`Apple Fritter flavor helper presentation mismatch: ${JSON.stringify(appleFlavor)}`);
  if (!apple.verificationExists || apple.verificationOpen !== false || !apple.verificationBeforeSources) throw new Error(`Apple Fritter verification placement mismatch: ${JSON.stringify(apple)}`);
  for (const kind of ['aroma','terpene']) {
    const reason = apple.reasons.find(item => item.kind === kind);
    if (!reason || !reason.title.includes('未確認') || !reason.reason) throw new Error(`Apple Fritter ${kind} reason missing: ${JSON.stringify(apple.reasons)}`);
  }
  if (apple.state?.cultivarId !== 'apple-fritter' || !['aroma','terpene'].every(kind => apple.state?.inactiveKinds?.includes(kind))) throw new Error(`Apple Fritter interaction state mismatch: ${JSON.stringify(apple.state)}`);
  if (apple.overflow) throw new Error('Apple Fritter interaction presentation has horizontal overflow');

  await navigate('blue-gelato-41');
  const blue = await readSensory('blue-gelato-41');
  const blueByKind = Object.fromEntries(blue.buttons.map(item => [item.kind, item]));
  for (const kind of ['aroma','flavor']) {
    const item = blueByKind[kind];
    if (!item || item.state !== 'active' || item.ariaDisabled !== 'false' || item.pointerEvents === 'none') throw new Error(`Blue Gelato ${kind} active semantics mismatch: ${JSON.stringify(item)}`);
  }
  const blueTerpene = blueByKind.terpene;
  if (!blueTerpene || blueTerpene.state !== 'inactive' || blueTerpene.ariaDisabled !== 'true' || blueTerpene.tabIndex !== '-1' || blueTerpene.pointerEvents !== 'none') throw new Error(`Blue Gelato terpene inactive semantics mismatch: ${JSON.stringify(blueTerpene)}`);
  if (!blue.verificationExists || blue.verificationOpen !== false || !blue.verificationBeforeSources) throw new Error(`Blue Gelato verification placement mismatch: ${JSON.stringify(blue)}`);
  const blueReason = blue.reasons.find(item => item.kind === 'terpene');
  if (!blueReason || !blueReason.title.includes('未確認') || !blueReason.reason.includes('個別テルペン') || !blueReason.reason.includes('確認')) throw new Error(`Blue Gelato terpene reason mismatch: ${JSON.stringify(blue.reasons)}`);
  if (blue.state?.cultivarId !== 'blue-gelato-41' || !blue.state?.inactiveKinds?.includes('terpene')) throw new Error(`Blue Gelato interaction state mismatch: ${JSON.stringify(blue.state)}`);
  if (blue.overflow) throw new Error('Blue Gelato interaction presentation has horizontal overflow');

  await navigate('rainbow-belts');
  const rainbow = await waitFor(() => evalv(`(()=>{
    const root=document.querySelector('.detail-public-v1[data-public-detail-id="rainbow-belts"],.ucd-root[data-public-detail-id="rainbow-belts"]');
    const lineage=document.querySelector('#detail-shell .ucd-lineage');
    const body=lineage?.querySelector(':scope > div');
    const evidence=body?.querySelector(':scope > .ucd-evidence-row');
    if(!root||!lineage||!body||!evidence||window.__CSWRainbowBeltsNameRelationshipRailV1?.status!=='PASS') return false;
    return {
      lineageCount:document.querySelectorAll('#detail-shell .ucd-lineage').length,
      rootLineage:lineage.querySelector(':scope > summary strong')?.textContent.trim()||'',
      kicker:lineage.querySelector(':scope > summary > span > small')?.textContent.trim()||'',
      evidenceLast:body.lastElementChild===evidence,
      evidenceJustify:getComputedStyle(evidence).justifyContent,
      integratedCount:body.querySelectorAll('[data-name-relationships-integrated="v2"]').length,
      overflow:root.scrollWidth>root.clientWidth+1||document.documentElement.scrollWidth>document.documentElement.clientWidth+1
    };
  })()`), 'Rainbow Belts protected lineage after interaction overlay');
  if (rainbow.lineageCount !== 1 || rainbow.rootLineage !== 'Zkittlez × Moonbow #75' || rainbow.kicker !== '系譜・系統関係 / LINEAGE & RELATIONSHIPS' || !rainbow.evidenceLast || rainbow.evidenceJustify !== 'flex-end' || rainbow.integratedCount !== 1 || rainbow.overflow) {
    throw new Error(`Rainbow Belts protected lineage changed under interaction overlay: ${JSON.stringify(rainbow)}`);
  }

  await navigate('do-si-dos');
  const doSiDosRail = await waitFor(() => evalv(`(()=>{
    const root=document.querySelector('.ucd-root[data-public-detail-id="do-si-dos"]');
    const lineage=document.querySelector('#detail-shell .ucd-lineage');
    const body=lineage?.querySelector(':scope > div');
    const integrated=body?.querySelector(':scope > [data-sitewide-lineage-integrated="v1"]');
    if(!root||!lineage||!body||!integrated||window.__CSWSitewideLineageRelationshipsV1?.status!=='PASS'||window.__CSWSitewideLineageRelationshipsV1?.cultivarId!=='do-si-dos') return false;
    const upstream=[...integrated.querySelectorAll(':scope > [data-upstream-family-context]')].map(row=>({
      parent:row.dataset.upstreamFamilyContext||'',
      kind:row.dataset.lineageContextKind||'',
      title:row.querySelector('.csw-name-rel-name')?.textContent.trim()||'',
      formula:row.querySelector('.csw-name-rel-lineage')?.textContent.trim()||'',
      labelJa:row.querySelector('.csw-name-rel-label > span')?.textContent.trim()||'',
      labelEn:row.querySelector('.csw-name-rel-label > small')?.textContent.trim()||'',
      hasNode:Boolean(row.querySelector('.csw-name-rel-node'))
    }));
    const alias=integrated.querySelector(':scope > .csw-name-rel-alias-row');
    const evidence=body.querySelector(':scope > .ucd-evidence-row');
    const prose=body.querySelector(':scope > p');
    return {
      lineageValue:lineage.querySelector(':scope > summary strong')?.textContent.trim()||'',
      mapCount:lineage.querySelectorAll('[data-lineage-map-v1="do-si-dos"]').length,
      compositionCount:lineage.querySelectorAll('[data-lineage-composition-v1="do-si-dos"]').length,
      oldContextCount:lineage.querySelectorAll('[data-lineage-parent-context-v1="do-si-dos"]').length,
      oldStoryCount:lineage.querySelectorAll('[data-lineage-story-v1="do-si-dos"]').length,
      upstreamCount:upstream.length,
      upstream,
      aliasPresent:Boolean(alias),
      aliasStandalone:Boolean(alias?.classList.contains('is-standalone')),
      aliasTrackDisplay:alias?getComputedStyle(alias.querySelector('.csw-name-rel-track')).display:'',
      prose:prose?.textContent.trim()||'',
      evidenceAfterRail:Boolean(evidence&&integrated.compareDocumentPosition(evidence)&Node.DOCUMENT_POSITION_FOLLOWING),
      ready:root.dataset.sitewideLineageRelationships||'',
      state:window.__CSWSitewideLineageRelationshipsV1||null,
      documentOverflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1
    };
  })()`), 'Do-Si-Dos upstream relationship rail');

  if (
    doSiDosRail.lineageValue !== 'OGKB × Face Off OG BX1' ||
    doSiDosRail.mapCount !== 0 ||
    doSiDosRail.compositionCount !== 0 ||
    doSiDosRail.oldContextCount !== 0 ||
    doSiDosRail.oldStoryCount !== 0 ||
    doSiDosRail.upstreamCount !== 2 ||
    doSiDosRail.ready !== 'v1' ||
    !doSiDosRail.upstream.some(item => item.parent === 'OGKB' && item.kind === 'family-side' && item.title === 'Cookies / GSC side' && item.formula === 'OGKB側の上流文脈' && item.labelJa === '系統背景' && item.labelEn === 'FAMILY SIDE' && item.hasNode) ||
    !doSiDosRail.upstream.some(item => item.parent === 'Face Off OG BX1' && item.kind === 'family-side' && item.title === 'OG side' && item.formula === 'Face Off OG BX1側の上流文脈' && item.labelJa === '系統背景' && item.labelEn === 'FAMILY SIDE' && item.hasNode) ||
    !doSiDosRail.aliasPresent ||
    doSiDosRail.aliasStandalone ||
    doSiDosRail.aliasTrackDisplay === 'none' ||
    doSiDosRail.prose !== 'OGKBはCookies / GSC側の系統、Face Off OG BX1はOG側のbreeding lineとして上流につながります。CSWではOGKBをGirl Scout Cookiesへ、Face Off OG BX1をOG Kushへ置き換えず、確認されたdirect parent名をそのまま保持しています。' ||
    !doSiDosRail.evidenceAfterRail ||
    doSiDosRail.state?.presentation !== 'relationship-rail-only' ||
    doSiDosRail.state?.upstreamCount !== 2 ||
    doSiDosRail.state?.lineageMapRendered !== false ||
    doSiDosRail.documentOverflow
  ) {
    throw new Error(`Do-Si-Dos upstream relationship rail mismatch: ${JSON.stringify(doSiDosRail)}`);
  }

  const runtimeErrors = cdp.events.filter(event => event.method === 'Runtime.exceptionThrown');
  if (runtimeErrors.length) throw new Error(`Runtime exceptions: ${JSON.stringify(runtimeErrors.slice(0, 3))}`);

  console.log(JSON.stringify({ status: 'PASS', apple, blue, rainbow, runtimeErrors: 0 }, null, 2));
  cdp.close();
}

try {
  await main();
} catch (error) {
  console.error(error);
  if (stderr) console.error(stderr.slice(-4000));
  process.exitCode = 1;
} finally {
  proc.kill('SIGTERM');
}
