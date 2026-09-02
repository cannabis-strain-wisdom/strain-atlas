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
    if (result.exceptionDetails) {
      throw new Error(`Eval exception: ${result.exceptionDetails.text}`);
    }
    return result.result.value;
  }

  await waitFor(() => evalv(`document.readyState==='complete'`), 'document complete');
  await waitFor(
    () => evalv(`document.querySelectorAll('#latest-grid [data-strain-id]').length>=1 && document.querySelectorAll('#cultivar-grid [data-strain-id]').length>=1`),
    'cultivar cards',
  );
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

  const runtimeErrors = cdp.events.filter(event => event.method === 'Runtime.exceptionThrown');
  if (runtimeErrors.length) throw new Error(`Runtime exceptions: ${JSON.stringify(runtimeErrors.slice(0, 3))}`);

  console.log(JSON.stringify({
    status: 'PASS',
    initial,
    searchCount,
    sativaCount,
    generation,
    generationCount,
    cbdCount,
    breeder,
    breederCount,
    latestId,
    latestTitle,
    allId,
    allTitle,
    runtimeErrors: 0,
  }, null, 2));
  cdp.close();
}

try {
  await main();
} catch (error) {
  console.error('CSW_BROWSER_SMOKE_FAIL', error.stack || error);
  console.error(stderr.slice(-3000));
  process.exitCode = 1;
} finally {
  try { proc.kill('SIGTERM'); } catch {}
  await sleep(100);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
