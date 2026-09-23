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
    await sleep(100);
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

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'csw-all-detail-390-'));
const proc = spawn(chrome, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--remote-debugging-port=9227',
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
proc.stderr.on('data', data => { stderr += String(data); });

async function main() {
  const catalog = await getJson(new URL('runtime/catalog.json', baseUrl));
  const cultivars = Array.isArray(catalog?.cultivars) ? catalog.cultivars : [];
  if (cultivars.length === 0) throw new Error('Expected at least one cultivar for the 390px detail sweep');

  await waitFor(async () => {
    try { return await getJson('http://127.0.0.1:9227/json/version'); }
    catch { return false; }
  }, 'Chrome DevTools');
  const pages = await getJson('http://127.0.0.1:9227/json/list');
  const page = pages.find(item => item.type === 'page');
  if (!page) throw new Error('No Chrome page target');

  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });

  async function evalv(expression) {
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(`Eval exception: ${result.exceptionDetails.text}`);
    return result.result.value;
  }

  const failures = [];
  const summaries = [];

  for (const cultivar of cultivars) {
    const id = cultivar.id;
    const expectedName = cultivar.name;
    try {
      const url = new URL(baseUrl);
      url.searchParams.set('strain', id);
      url.searchParams.set('qa', 'all74-390');
      url.hash = 'ignored-fragment';
      await cdp.send('Page.navigate', { url: url.href });
      await waitFor(() => evalv(`document.readyState==='complete'`), `${id} document complete`);
      await waitFor(() => evalv(`(()=>{
        const root=document.querySelector('.detail-public-v1[data-public-detail-id="${id}"],.ucd-root[data-public-detail-id="${id}"]');
        return !!root && !!document.querySelector('#detail-shell [data-detail-share]') && window.__CSWDetailShareV2?.contract==='CSW_DETAIL_SHARE_V2';
      })()`), `${id} detail ready`);
      await waitFor(() => evalv(`(()=>{
        const root=document.querySelector('.detail-public-v1[data-public-detail-id="${id}"],.ucd-root[data-public-detail-id="${id}"]');
        return !!root &&
          root.dataset.cswDetailInactiveScope==='all' &&
          window.__CSWDetailInteractionV1?.status==='PASS' &&
          window.__CSWDetailInteractionV1?.cultivarId==='${id}' &&
          window.__CSWDetailInteractionV1?.scope==='all-detail-categories';
      })()`), `${id} full inactive-state contract`);
      await waitFor(() => evalv(`(()=>{
        const shell=document.getElementById('detail-shell');
        const root=shell?.querySelector('.detail-public-v1[data-public-detail-id="${id}"],.ucd-root[data-public-detail-id="${id}"]');
        if(!root) return false;
        const managed=[...new Set([
          ...root.querySelectorAll('button[data-csw-detail-state],summary[data-csw-detail-state]'),
          ...shell.querySelectorAll('.ucd-lineage summary[data-csw-detail-state]')
        ])];
        return managed.length>0;
      })()`), `${id} managed detail controls ready`);
      await sleep(20);

      const state = await evalv(`(()=>{
        const shell=document.getElementById('detail-shell');
        const root=shell?.querySelector('.detail-public-v1[data-public-detail-id="${id}"],.ucd-root[data-public-detail-id="${id}"]');
        const title=shell?.querySelector('.ucd-title-row h2,.public-hero-copy h2,.detail-hero h2')?.textContent.trim()||'';
        const button=shell?.querySelector('[data-detail-share]');
        const bar=shell?.querySelector(':scope > .detail-topbar');
        const sensory=[...root.querySelectorAll('[data-csw-staged-sensory-sub]')].map(node=>({
          kind:node.dataset.cswStagedSensorySub||'',
          state:node.dataset.cswDetailState||'',
          ariaDisabled:node.getAttribute('aria-disabled'),
          tabIndex:node.getAttribute('tabindex'),
          pointerEvents:getComputedStyle(node).pointerEvents,
          helperDisplay:node.querySelector('small')?getComputedStyle(node.querySelector('small')).display:null
        }));
        const managedNodes=[...new Set([
          ...root.querySelectorAll('button[data-csw-detail-state],summary[data-csw-detail-state]'),
          ...shell.querySelectorAll('.ucd-lineage summary[data-csw-detail-state]')
        ])];
        const managed=managedNodes.map(node=>({
          kind:node.dataset.cswStagedSensorySub||node.dataset.cswStagedEcSub||node.dataset.ucdPrimaryTab||node.dataset.ucdTab||(node.closest('.ucd-lineage')?'lineage':''),
          tag:node.tagName.toLowerCase(),
          state:node.dataset.cswDetailState||'',
          ariaDisabled:node.getAttribute('aria-disabled'),
          tabIndex:node.getAttribute('tabindex'),
          pointerEvents:getComputedStyle(node).pointerEvents,
          disabled:'disabled' in node?node.disabled:null,
          chevronVisible:!!node.querySelector(':scope > i')&&getComputedStyle(node.querySelector(':scope > i')).display!=='none'
        }));
        const interaction=window.__CSWDetailInteractionV1||null;
        const verification=root.querySelector('[data-csw-verification-status="v1"]');
        const reasons=verification?[...verification.querySelectorAll('[data-csw-verification-kind]')].map(row=>row.dataset.cswVerificationKind||'').filter(Boolean):[];
        return {
          id:root?.dataset?.publicDetailId||'',
          title,
          shareLabel:button?.getAttribute('aria-label')||'',
          shareWidth:button?Math.round(button.getBoundingClientRect().width):0,
          shareHeight:button?Math.round(button.getBoundingClientRect().height):0,
          barPosition:bar?getComputedStyle(bar).position:'',
          sensory,
          managed,
          interactionStatus:interaction?.status||'',
          interactionScope:interaction?.scope||'',
          inactiveKinds:Array.isArray(interaction?.inactiveKinds)?interaction.inactiveKinds:[],
          verificationExists:!!verification,
          verificationOpen:verification?.open??null,
          verificationBeforeSources:!!verification&&!!root.querySelector('.ucd-sources')&&verification.nextElementSibling===root.querySelector('.ucd-sources'),
          reasons,
          overflow:!!root&&(root.scrollWidth>root.clientWidth+1||document.documentElement.scrollWidth>document.documentElement.clientWidth+1)
        };
      })()`);

      if (state.id !== id) throw new Error(`detail id mismatch ${JSON.stringify(state)}`);
      if (state.title !== expectedName) throw new Error(`visible title mismatch expected=${expectedName} actual=${state.title}`);
      if (state.shareLabel !== 'この品種を共有' || state.shareWidth < 40 || state.shareHeight < 40 || state.barPosition !== 'fixed') throw new Error(`share control mismatch ${JSON.stringify(state)}`);
      if (state.overflow) throw new Error('horizontal overflow');

      if (state.interactionStatus !== 'PASS' || state.interactionScope !== 'all-detail-categories') throw new Error(`detail interaction scope mismatch ${JSON.stringify(state)}`);
      for (const item of state.sensory) {
        if (item.helperDisplay !== 'none') throw new Error(`sensory helper remained visible ${JSON.stringify(item)}`);
      }
      if (!state.managed.length) throw new Error('no managed detail category controls');
      for (const item of state.managed) {
        if (item.state === 'inactive') {
          if (item.ariaDisabled !== 'true' || item.tabIndex !== '-1' || item.pointerEvents !== 'none') throw new Error(`inactive detail semantics mismatch ${JSON.stringify(item)}`);
          if (item.tag === 'button' && item.disabled !== true) throw new Error(`inactive detail button not natively disabled ${JSON.stringify(item)}`);
          if (item.chevronVisible) throw new Error(`inactive detail chevron still visible ${JSON.stringify(item)}`);
        } else if (item.state === 'active') {
          if (item.ariaDisabled !== 'false' || item.pointerEvents === 'none') throw new Error(`active detail semantics mismatch ${JSON.stringify(item)}`);
          if (item.tag === 'button' && item.disabled === true) throw new Error(`active detail button disabled ${JSON.stringify(item)}`);
        } else {
          throw new Error(`detail state missing ${JSON.stringify(item)}`);
        }
      }
      if (state.inactiveKinds.length) {
        if (!state.verificationExists || state.verificationOpen !== false || !state.verificationBeforeSources) throw new Error(`verification disclosure mismatch ${JSON.stringify(state)}`);
        for (const kind of state.inactiveKinds) if (!state.reasons.includes(kind)) throw new Error(`verification reason missing for ${kind}`);
      } else if (state.verificationExists) {
        throw new Error('verification disclosure rendered without inactive detail state');
      }

      await evalv(`(()=>{
        window.__CSWShareCapture=[];
        Object.defineProperty(navigator,'share',{configurable:true,value:async payload=>{window.__CSWShareCapture.push(payload);}});
        document.querySelector('#detail-shell [data-detail-share]').click();
        return true;
      })()`);
      const share = await waitFor(() => evalv(`window.__CSWShareCapture?.length===1?window.__CSWShareCapture[0]:false`), `${id} share payload`);
      const shareState = await waitFor(() => evalv(`window.__CSWDetailShareV2?.status==='SHARED'&&window.__CSWDetailShareV2?.method==='native'?window.__CSWDetailShareV2:false`), `${id} share state`);
      const shareUrl = new URL(share.url);
      const expectedTitle = `${expectedName} | Cannabis Strain Wisdom`;
      if (share.title !== expectedTitle || share.text !== expectedTitle || shareState.cultivarId !== id || shareState.cultivarName !== expectedName) throw new Error(`share identity mismatch ${JSON.stringify({ share, shareState })}`);
      if (shareUrl.searchParams.get('strain') !== id || shareUrl.searchParams.size !== 1 || shareUrl.hash) throw new Error(`share URL mismatch ${share.url}`);
      await sleep(20);
      const shareCount = await evalv(`window.__CSWShareCapture?.length||0`);
      if (shareCount !== 1) throw new Error(`share handler duplicated: ${shareCount}`);

      if (id === 'rainbow-belts') {
        const rainbow = await waitFor(() => evalv(`(()=>{
          const shell=document.getElementById('detail-shell');
          const root=shell?.querySelector('.detail-public-v1[data-public-detail-id="rainbow-belts"],.ucd-root[data-public-detail-id="rainbow-belts"]');
          const lineage=shell?.querySelector('[data-csw-lineage-relations-integrated="v2"],.ucd-lineage');
          const integrated=shell?.querySelector('[data-name-relationships-integrated="v2"]');
          if(!root||!lineage||!integrated||window.__CSWRainbowBeltsNameRelationshipRailV1?.status!=='PASS') return false;
          const mainLineage=shell.querySelector('.ucd-lineage');
          const body=mainLineage?.querySelector(':scope > div');
          const evidence=body?.querySelector(':scope > .ucd-evidence-row');
          return {
            count:shell.querySelectorAll('.ucd-lineage').length,
            root:mainLineage?.querySelector(':scope > summary strong')?.textContent.trim()||'',
            kicker:mainLineage?.querySelector(':scope > summary > span > small')?.textContent.trim()||'',
            evidenceLast:!!body&&body.lastElementChild===evidence,
            evidenceJustify:evidence?getComputedStyle(evidence).justifyContent:'',
            integratedCount:body?.querySelectorAll('[data-name-relationships-integrated="v2"]').length||0
          };
        })()`), 'Rainbow Belts protected lineage');
        if (rainbow.count !== 1 || rainbow.root !== 'Zkittlez × Moonbow #75' || rainbow.kicker !== '系譜・系統関係 / LINEAGE & RELATIONSHIPS' || !rainbow.evidenceLast || rainbow.evidenceJustify !== 'flex-end' || rainbow.integratedCount !== 1) throw new Error(`Rainbow lineage regression ${JSON.stringify(rainbow)}`);
      }

      summaries.push({ id, inactive: state.inactiveKinds, overflow: false, share: 'PASS' });
    } catch (error) {
      failures.push({ id, error: String(error?.message || error) });
    }
  }

  const runtimeErrors = cdp.events.filter(event => event.method === 'Runtime.exceptionThrown');
  if (runtimeErrors.length) failures.push({ id: 'runtime', error: `Runtime exceptions: ${JSON.stringify(runtimeErrors.slice(0, 3))}` });

  const result = {
    status: failures.length ? 'FAIL' : 'PASS',
    viewport: '390x844',
    total: cultivars.length,
    passed: cultivars.length - failures.filter(item => item.id !== 'runtime').length,
    failures,
    inactiveCultivars: summaries.filter(item => item.inactive.length).length,
    shareValidated: summaries.filter(item => item.share === 'PASS').length,
    runtimeErrors: runtimeErrors.length,
  };
  console.log(JSON.stringify(result, null, 2));
  if (failures.length) throw new Error(`ALL CULTIVAR 390PX SWEEP FAILED: ${JSON.stringify(failures.slice(0, 10))}`);
  console.log(`ALL CULTIVAR 390PX DETAIL SWEEP PASS ${cultivars.length}/${cultivars.length}`);
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
