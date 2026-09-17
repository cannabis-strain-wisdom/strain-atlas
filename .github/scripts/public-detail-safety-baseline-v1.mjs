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

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'csw-detail-safety-'));
const proc = spawn(chrome, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--remote-debugging-port=9224',
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });

let stderr = '';
proc.stderr.on('data', data => { stderr += String(data); });

async function main() {
  const catalog = await getJson(new URL('runtime/catalog.json', baseUrl));
  const counts = catalog?.counts || {};
  if ((counts.cultivars || 0) < 74) throw new Error(`Cultivar count regressed below protected floor: ${counts.cultivars}`);
  if ((counts.sources || 0) < 143) throw new Error(`Source count regressed below protected floor: ${counts.sources}`);
  if ((counts.entities || 0) < 28) throw new Error(`Entity count regressed below protected floor: ${counts.entities}`);
  if (!Array.isArray(catalog.cultivars) || !catalog.cultivars.some(item => item?.id === 'rainbow-belts')) {
    throw new Error('Rainbow Belts missing from runtime catalog');
  }

  await waitFor(async () => {
    try { return await getJson('http://127.0.0.1:9224/json/version'); }
    catch { return false; }
  }, 'Chrome DevTools');

  const pages = await getJson('http://127.0.0.1:9224/json/list');
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
    await waitFor(() => evalv(`document.getElementById('detail-dialog')?.open===true && !!document.querySelector('.detail-public-v1[data-public-detail-id="${id}"],.ucd-root[data-public-detail-id="${id}"]')`), `${id} detail open`);
  }

  await navigate('rainbow-belts');
  const rainbow = await waitFor(() => evalv(`(()=>{
    const root=document.querySelector('.detail-public-v1[data-public-detail-id="rainbow-belts"],.ucd-root[data-public-detail-id="rainbow-belts"]');
    const lineageCards=[...document.querySelectorAll('#detail-shell .ucd-lineage')];
    const lineage=lineageCards[0];
    const body=lineage?.querySelector(':scope > div');
    const evidence=body?.querySelector(':scope > .ucd-evidence-row');
    const aliases=[...body?.querySelectorAll('[data-name-relationships-integrated="v2"] .csw-name-rel-chip')||[]].map(node=>node.textContent.trim());
    const derived=[...body?.querySelectorAll('[data-name-relationships-integrated="v2"] .csw-name-rel-rail-item')||[]].map(row=>({name:row.querySelector('.csw-name-rel-name')?.textContent.trim()||'',lineage:row.querySelector('.csw-name-rel-lineage')?.textContent.trim()||''}));
    const state=window.__CSWRainbowBeltsNameRelationshipRailV1||null;
    if(!root||!lineage||!body||!evidence||state?.status!=='PASS') return false;
    return {
      lineageCount:lineageCards.length,
      rootLineage:lineage.querySelector(':scope > summary strong')?.textContent.trim()||'',
      kicker:lineage.querySelector(':scope > summary > span > small')?.textContent.trim()||'',
      aliases,
      derived,
      evidenceLast:body.lastElementChild===evidence,
      evidenceJustify:getComputedStyle(evidence).justifyContent,
      integratedCount:body.querySelectorAll('[data-name-relationships-integrated="v2"]').length,
      separateCardCount:root.querySelectorAll('[data-name-relationships="v1"]').length,
      hasAuto:/\bauto\b/i.test(body.querySelector('[data-name-relationships-integrated="v2"]')?.innerText||''),
      marker:root.dataset.nameRelationships||'',
      contract:state.contract||'',
      presentation:state.presentation||'',
      overflow:root.scrollWidth>root.clientWidth+1 || document.documentElement.scrollWidth>document.documentElement.clientWidth+1
    };
  })()`), 'Rainbow Belts protected lineage presentation');

  if (rainbow.lineageCount !== 1) throw new Error(`Rainbow lineage card count changed: ${JSON.stringify(rainbow)}`);
  if (rainbow.rootLineage !== 'Zkittlez × Moonbow #75') throw new Error(`Rainbow root lineage changed: ${JSON.stringify(rainbow)}`);
  if (rainbow.kicker !== '系譜・系統関係 / LINEAGE & RELATIONSHIPS') throw new Error(`Rainbow lineage heading changed: ${JSON.stringify(rainbow)}`);
  for (const alias of ['Rainbow Beltz','Rainbow Belt','RaB']) if (!rainbow.aliases.includes(alias)) throw new Error(`Rainbow alias missing ${alias}: ${JSON.stringify(rainbow)}`);
  const expectedDerived = [
    { name: 'Rainbow Belts 2.0', lineage: 'Rainbow Belts #20 × Rainbow Belts F1' },
    { name: 'Rainbow Belts 3.0', lineage: 'Rainbow Belts #20 × Moonbow #112 F2 #60' },
  ];
  if (JSON.stringify(rainbow.derived) !== JSON.stringify(expectedDerived)) throw new Error(`Rainbow derived lineage changed: ${JSON.stringify(rainbow)}`);
  if (!rainbow.evidenceLast || rainbow.evidenceJustify !== 'flex-end') throw new Error(`Rainbow evidence footer placement changed: ${JSON.stringify(rainbow)}`);
  if (rainbow.integratedCount !== 1 || rainbow.separateCardCount !== 0 || rainbow.hasAuto) throw new Error(`Rainbow relationship structure regressed: ${JSON.stringify(rainbow)}`);
  if (rainbow.marker !== 'v2' || rainbow.contract !== 'RAINBOW_BELTS_NAME_RELATIONSHIP_RAIL_V1' || rainbow.presentation !== 'RAINBOW_BELTS_LINEAGE_RELATIONSHIPS_INTEGRATED_V2') throw new Error(`Rainbow contract marker changed: ${JSON.stringify(rainbow)}`);
  if (rainbow.overflow) throw new Error('Rainbow Belts detail has horizontal overflow');

  await navigate('apple-fritter');
  const apple = await evalv(`(()=>{
    const root=document.querySelector('.detail-public-v1[data-public-detail-id="apple-fritter"]');
    const kinds=[...root?.querySelectorAll('[data-csw-staged-sensory-sub]')||[]].map(node=>node.dataset.cswStagedSensorySub).sort();
    const unknown=['aroma','terpene'].filter(kind=>root?.querySelector('[data-ucd-panel="'+kind+'"]')?.dataset.unavailableDetailCard==='v1').sort();
    return {kinds,unknown,overflow:!root||root.scrollWidth>root.clientWidth+1};
  })()`);
  if (JSON.stringify(apple.kinds) !== JSON.stringify(['aroma','flavor','terpene'])) throw new Error(`Apple Fritter sensory structure changed: ${JSON.stringify(apple)}`);
  if (JSON.stringify(apple.unknown) !== JSON.stringify(['aroma','terpene'])) throw new Error(`Apple Fritter unknown domains changed: ${JSON.stringify(apple)}`);
  if (apple.overflow) throw new Error('Apple Fritter detail has horizontal overflow');

  await navigate('blue-gelato-41');
  const blue = await evalv(`(()=>{
    const root=document.querySelector('.detail-public-v1[data-public-detail-id="blue-gelato-41"]');
    const kinds=[...root?.querySelectorAll('[data-csw-staged-sensory-sub]')||[]].map(node=>node.dataset.cswStagedSensorySub).sort();
    const terpenePanel=root?.querySelector('[data-ucd-panel="terpene"]');
    const terpeneUnknown=terpenePanel?.dataset.unavailableDetailCard==='v1'||/個別テルペンは確認できていません/.test(terpenePanel?.innerText||'');
    const effectCultivation=root?.querySelectorAll('[data-csw-staged-ec-parent="v1"]').length||0;
    return {kinds,terpeneUnknown,effectCultivation,overflow:!root||root.scrollWidth>root.clientWidth+1};
  })()`);
  if (JSON.stringify(blue.kinds) !== JSON.stringify(['aroma','flavor','terpene'])) throw new Error(`Blue Gelato sensory structure changed: ${JSON.stringify(blue)}`);
  if (!blue.terpeneUnknown || blue.effectCultivation !== 1) throw new Error(`Blue Gelato grouped structure changed: ${JSON.stringify(blue)}`);
  if (blue.overflow) throw new Error('Blue Gelato detail has horizontal overflow');

  const runtimeErrors = cdp.events.filter(event => event.method === 'Runtime.exceptionThrown');
  if (runtimeErrors.length) throw new Error(`Runtime exceptions: ${JSON.stringify(runtimeErrors.slice(0, 3))}`);

  console.log(JSON.stringify({
    status: 'PASS',
    counts,
    rainbow,
    apple,
    blue,
    runtimeErrors: 0,
  }, null, 2));

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
