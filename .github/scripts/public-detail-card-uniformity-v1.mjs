import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.env.CSW_BASE_URL || 'http://127.0.0.1:4173/';
const chrome = process.env.CHROME_BIN;
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
  async function evalv(expression) {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`Eval exception: ${r.exceptionDetails.text}`);
    return r.result.value;
  }
  const catalog = await getJson(new URL('runtime/catalog.json', baseUrl));
  const ids = (catalog.cultivars || []).map(item => item.id); if (!ids.length) throw new Error('No public cultivars');
  const failures = [];
  for (const id of ids) {
    cdp.exceptions.length = 0;
    await cdp.send('Page.navigate', { url: `${baseUrl}?strain=${encodeURIComponent(id)}` });
    await waitFor(() => evalv(`document.readyState==='complete'`), `${id} document`);
    await waitFor(() => evalv(`(()=>{const r=document.querySelector('.detail-public-v1[data-public-detail-id=${JSON.stringify(id)}],.ucd-root[data-public-detail-id=${JSON.stringify(id)}]');return !!r&&r.dataset.fixedDetailCardsV1==='true'&&r.dataset.fixedPrimaryCardsV1==='true'&&r.dataset.fixedLineageCardV1==='true'})()`), `${id} fixed detail cards`, 20000);
    const state = await evalv(`(()=>{const r=document.querySelector('.detail-public-v1[data-public-detail-id=${JSON.stringify(id)}],.ucd-root[data-public-detail-id=${JSON.stringify(id)}]');return {lineage:!!document.querySelector('#detail-shell .ucd-lineage'),type:!!r?.querySelector('[data-ucd-primary-tab="type"]'),cannabinoid:!!r?.querySelector('[data-ucd-primary-tab="cannabinoid"]'),aroma:!!r?.querySelector('[data-ucd-tab="aroma"]'),terpene:!!r?.querySelector('[data-ucd-tab="terpene"]'),morphology:!!r?.querySelector('[data-ucd-tab="morphology"]'),originHistory:!!r?.querySelector('[data-ucd-tab="origin-history"]'),flavor:${JSON.stringify(id)}!=='apple-fritter'||!!r?.querySelector('[data-ucd-tab="flavor"]'),flavorBilingual:${JSON.stringify(id)}!=='apple-fritter'||r?.dataset.appleFritterFlavorBilingual==='APPLE_FRITTER_FLAVOR_BILINGUAL_V1',overflow:r?r.scrollWidth>r.clientWidth+1:true}})()`);
    const missing = Object.entries(state).filter(([key, value]) => key !== 'overflow' && !value).map(([key]) => key);
    if (state.overflow) missing.push('horizontalOverflow');
    if (cdp.exceptions.length) missing.push(`runtimeExceptions:${cdp.exceptions.length}`);
    if (missing.length) failures.push({ id, missing, state });
  }
  cdp.close();
  if (failures.length) throw new Error(`UNIFORM_DETAIL_CARD_FAILURES ${JSON.stringify(failures)}`);
  console.log(`UNIFORM DETAIL CARDS PASS ${ids.length}/${ids.length} x 7 frames`);
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
