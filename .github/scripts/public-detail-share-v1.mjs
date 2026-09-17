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
    await sleep(120);
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

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'csw-detail-share-'));
const proc = spawn(chrome, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--remote-debugging-port=9226',
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
proc.stderr.on('data', data => { stderr += String(data); });

async function main() {
  await waitFor(async () => {
    try { return await getJson('http://127.0.0.1:9226/json/version'); }
    catch { return false; }
  }, 'Chrome DevTools');
  const pages = await getJson('http://127.0.0.1:9226/json/list');
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

  const url = new URL(baseUrl);
  url.searchParams.set('strain', 'sunset-sherbert');
  url.searchParams.set('qa', 'share-v1');
  url.hash = 'ignored-fragment';
  await cdp.send('Page.navigate', { url: url.href });
  await waitFor(() => evalv(`document.readyState==='complete'`), 'document complete');
  await waitFor(() => evalv(`!!document.querySelector('#detail-shell [data-detail-share="v1"]') && !!document.querySelector('.detail-public-v1[data-public-detail-id="sunset-sherbert"],.ucd-root[data-public-detail-id="sunset-sherbert"]')`), 'Sunset Sherbert share button');

  const baseline = await evalv(`(()=>{
    const shell=document.getElementById('detail-shell');
    const bar=shell?.querySelector(':scope > .detail-topbar');
    const button=bar?.querySelector('[data-detail-share="v1"]');
    const root=shell?.querySelector('.detail-public-v1[data-public-detail-id="sunset-sherbert"],.ucd-root[data-public-detail-id="sunset-sherbert"]');
    return {
      label:button?.getAttribute('aria-label')||'',
      shellReady:shell?.classList.contains('csw-detail-share-ready')||false,
      actionbar:bar?.classList.contains('csw-detail-actionbar-v1')||false,
      barPosition:bar?getComputedStyle(bar).position:'',
      buttonWidth:button?Math.round(button.getBoundingClientRect().width):0,
      buttonHeight:button?Math.round(button.getBoundingClientRect().height):0,
      title:root?.querySelector('.detail-hero h2')?.textContent.trim()||'',
      overflow:!!root&&(root.scrollWidth>root.clientWidth+1||document.documentElement.scrollWidth>document.documentElement.clientWidth+1)
    };
  })()`);
  if (baseline.label !== 'この品種を共有' || !baseline.shellReady || !baseline.actionbar || baseline.barPosition !== 'fixed' || baseline.buttonWidth < 40 || baseline.buttonHeight < 40 || baseline.title !== 'Sunset Sherbert' || baseline.overflow) {
    throw new Error(`Share presentation baseline mismatch: ${JSON.stringify(baseline)}`);
  }

  await evalv(`(()=>{
    window.__CSWShareCapture=null;
    Object.defineProperty(navigator,'share',{configurable:true,value:async payload=>{window.__CSWShareCapture=payload;}});
    document.querySelector('#detail-shell [data-detail-share="v1"]').click();
    return true;
  })()`);
  const nativeShare = await waitFor(() => evalv(`window.__CSWShareCapture||false`), 'native share payload');
  const nativeUrl = new URL(nativeShare.url);
  if (nativeShare.title !== 'Sunset Sherbert | Cannabis Strain Wisdom' || nativeShare.text !== 'Sunset Sherbert | Cannabis Strain Wisdom') {
    throw new Error(`Native share copy mismatch: ${JSON.stringify(nativeShare)}`);
  }
  if (nativeUrl.searchParams.get('strain') !== 'sunset-sherbert' || nativeUrl.searchParams.size !== 1 || nativeUrl.hash) {
    throw new Error(`Native share URL was not canonicalized: ${nativeShare.url}`);
  }

  await evalv(`(()=>{
    window.__CSWClipboardCapture=null;
    Object.defineProperty(navigator,'share',{configurable:true,value:undefined});
    const fakeClipboard={writeText:async value=>{window.__CSWClipboardCapture=value;}};
    try { Object.defineProperty(navigator,'clipboard',{configurable:true,value:fakeClipboard}); }
    catch (_) { try { navigator.clipboard.writeText=fakeClipboard.writeText; } catch (_) {} }
    document.querySelector('#detail-shell [data-detail-share="v1"]').click();
    return true;
  })()`);
  const copiedUrl = await waitFor(() => evalv(`window.__CSWClipboardCapture||false`), 'clipboard fallback');
  const fallbackUrl = new URL(copiedUrl);
  if (fallbackUrl.searchParams.get('strain') !== 'sunset-sherbert' || fallbackUrl.searchParams.size !== 1 || fallbackUrl.hash) {
    throw new Error(`Clipboard share URL was not canonicalized: ${copiedUrl}`);
  }
  const copiedFeedback = await evalv(`document.querySelector('#detail-shell [data-detail-share="v1"]')?.classList.contains('is-copied')||false`);
  if (!copiedFeedback) throw new Error('Clipboard fallback did not surface copied feedback');

  const runtimeErrors = cdp.events.filter(event => event.method === 'Runtime.exceptionThrown');
  if (runtimeErrors.length) throw new Error(`Runtime exceptions: ${JSON.stringify(runtimeErrors.slice(0, 3))}`);

  console.log(JSON.stringify({
    status: 'PASS',
    viewport: '390x844',
    cultivar: 'sunset-sherbert',
    baseline,
    nativeShare,
    copiedUrl,
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
