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
    try { last = await fn(); if (last) return last; } catch (error) { last = error; }
    await sleep(100);
  }
  throw new Error(`Timeout waiting for ${label}${last instanceof Error ? ': '+last.message : ''}`);
}
class CDP {
  constructor(url) { this.ws = new WebSocket(url); this.id = 0; this.pending = new Map(); this.events = []; }
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
      } else this.events.push(message);
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

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'csw-detail-readability-'));
const proc = spawn(chrome, [
  '--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  '--remote-debugging-port=9231',`--user-data-dir=${profile}`,'about:blank'
], { stdio: ['ignore','pipe','pipe'] });
let stderr='';
proc.stderr.on('data', data => { stderr += String(data); });

async function main() {
  const catalog = await getJson(new URL('runtime/catalog.json', baseUrl));
  const cultivars = Array.isArray(catalog?.cultivars) ? catalog.cultivars : [];
  if (cultivars.length !== 74) throw new Error(`Expected 74 cultivars, got ${cultivars.length}`);

  await waitFor(async () => {
    try { return await getJson('http://127.0.0.1:9231/json/version'); } catch { return false; }
  }, 'Chrome DevTools');
  const pages = await getJson('http://127.0.0.1:9231/json/list');
  const page = pages.find(item => item.type === 'page');
  if (!page) throw new Error('No Chrome page target');
  const cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});

  async function evalv(expression) {
    const result = await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if (result.exceptionDetails) throw new Error('Eval exception: '+result.exceptionDetails.text);
    return result.result.value;
  }

  const aggregate = new Map();
  const sampleCultivars = new Set(['apple-fritter','mimosa','rainbow-belts','dr-grinspoon','blue-gelato-41','sunset-sherbert']);
  const samples = {};
  const readabilityFailures = [];
  const floorSummary = {};

  for (const cultivar of cultivars) {
    const id=cultivar.id;
    const url=new URL(baseUrl);
    url.searchParams.set('strain',id);
    url.searchParams.set('qa','readability-audit');
    await cdp.send('Page.navigate',{url:url.href});
    await waitFor(()=>evalv(`document.readyState==='complete'`),id+' document');
    await waitFor(()=>evalv(`(()=>{
      const root=document.querySelector('.detail-public-v1[data-public-detail-id="${id}"],.ucd-root[data-public-detail-id="${id}"]');
      return !!root&&root.dataset.publicPresentationReady==='true'&&root.dataset.fixedDetailCardsV1==='true'&&root.dataset.fixedPrimaryCardsV1==='true'&&root.dataset.cswDetailInactiveScope==='all';
    })()`),id+' detail ready',20000);
    await sleep(120);

    const rows=await evalv(`(()=>{
      const shell=document.getElementById('detail-shell');
      const selectors='p,small,strong,a,span,button,summary';
      const nodes=[...shell.querySelectorAll(selectors)];
      const visible=node=>{
        const s=getComputedStyle(node),r=node.getBoundingClientRect();
        return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;
      };
      const leafish=node=>{
        const own=(node.textContent||'').trim();
        if(!own)return false;
        const childText=[...node.children].map(ch=>(ch.textContent||'').trim()).join('');
        return !childText||own.length>childText.length;
      };
      return nodes.filter(node=>visible(node)&&leafish(node)).map(node=>{
        const s=getComputedStyle(node);
        const parent=node.parentElement;
        return {
          tag:node.tagName.toLowerCase(),
          cls:[...node.classList].sort().join('.'),
          parent:parent?[...parent.classList].sort().join('.'):'',
          text:(node.textContent||'').replace(/\\s+/g,' ').trim().slice(0,90),
          font:parseFloat(s.fontSize)||0,
          line:parseFloat(s.lineHeight)||0,
          weight:s.fontWeight,
          color:s.color
        };
      }).filter(item=>item.font>0&&item.font<14);
    })()`);

    const floors=await evalv(`(()=>{
      const root=document.querySelector('.detail-public-v1[data-public-detail-id="${id}"],.ucd-root[data-public-detail-id="${id}"]');
      const shell=document.getElementById('detail-shell');
      const font=selector=>{const n=shell?.querySelector(selector);return n?parseFloat(getComputedStyle(n).fontSize)||0:null};
      const line=selector=>{const n=shell?.querySelector(selector);return n?parseFloat(getComputedStyle(n).lineHeight)||0:null};
      return {
        lineageKicker:font('.ucd-lineage[data-sitewide-lineage="v1"]>summary>span>small'),
        lineageBody:font('.ucd-lineage>div'),
        lineageBodyParagraph:font('.ucd-lineage>div>p'),
        lineageNote:font('.ucd-lineage-note-v1'),
        evidenceGrade:font('.ucd-evidence-row .ucd-grade'),
        evidenceLink:font('.ucd-evidence-row a'),
        aliasHeading:font('.csw-name-rel-section-label strong'),
        aliasCode:font('.csw-name-rel-section-label small'),
        aliasChip:font('.csw-name-rel-chip'),
        relatedName:font('.csw-name-rel-name'),
        relatedLineage:font('.csw-name-rel-lineage'),
        relationshipLabel:font('.csw-name-rel-label'),
        relationshipCode:font('.csw-name-rel-label small'),
        sourcesKicker:font('.ucd-sources summary small'),
        sourceMeta:font('.ucd-sources a>span'),
        sourceTitle:font('.ucd-sources a>strong'),
        primaryKicker:font('.ucd-primary-nav-copy small'),
        verificationSummary:font('.csw-verification-status-v1>summary>span'),
        verificationTitle:font('.csw-verification-status-v1-item strong'),
        verificationBody:font('.csw-verification-status-v1-item p'),
        lineageLine:line('.ucd-lineage>div'),
        overflow:!!root&&(root.scrollWidth>root.clientWidth+1||document.documentElement.scrollWidth>document.documentElement.clientWidth+1)
      };
    })()`);

    const requirements={
      lineageKicker:11,
      lineageBody:15,
      lineageBodyParagraph:15,
      lineageNote:14.5,
      evidenceGrade:11,
      evidenceLink:12.5,
      aliasHeading:13,
      aliasCode:10,
      aliasChip:12.5,
      relatedName:14.5,
      relatedLineage:13.5,
      relationshipLabel:11.5,
      relationshipCode:10,
      sourcesKicker:11,
      sourceMeta:11.5,
      sourceTitle:13,
      primaryKicker:12.5,
      verificationSummary:13,
      verificationTitle:14,
      verificationBody:14.5
    };
    for(const [key,min] of Object.entries(requirements)){
      const value=floors[key];
      if(value!==null&&value+0.01<min) readabilityFailures.push({id,key,value,min});
      if(value!==null){
        const agg=floorSummary[key]||{min:value,max:value,count:0};
        agg.min=Math.min(agg.min,value);agg.max=Math.max(agg.max,value);agg.count+=1;floorSummary[key]=agg;
      }
    }
    if(floors.overflow) readabilityFailures.push({id,key:'horizontalOverflow'});
    if(floors.lineageLine!==null&&floors.lineageLine<24) readabilityFailures.push({id,key:'lineageLineHeight',value:floors.lineageLine,min:24});

    if (sampleCultivars.has(id)) samples[id]={smallText:rows.slice(0,160),floors};
    for (const row of rows) {
      const key=[row.tag,row.cls,row.parent,row.font,row.line,row.weight].join('|');
      const prev=aggregate.get(key)||{...row,count:0,cultivars:new Set(),examples:[]};
      prev.count+=1;
      prev.cultivars.add(id);
      if(prev.examples.length<3&&!prev.examples.includes(row.text))prev.examples.push(row.text);
      aggregate.set(key,prev);
    }
  }

  const summary=[...aggregate.values()].map(item=>({
    tag:item.tag,cls:item.cls,parent:item.parent,font:item.font,line:item.line,weight:item.weight,
    count:item.count,cultivars:item.cultivars.size,examples:item.examples
  })).sort((a,b)=>a.font-b.font||b.cultivars-a.cultivars||b.count-a.count);

  const runtimeErrors=cdp.events.filter(event=>event.method==='Runtime.exceptionThrown');
  const result={
    status:runtimeErrors.length||readabilityFailures.length?'FAIL':'PASS',
    viewport:'390x844',
    cultivars:cultivars.length,
    signatures:summary.length,
    floorSummary,
    readabilityFailures,
    below12:summary.filter(x=>x.font<12),
    from12to13_9:summary.filter(x=>x.font>=12&&x.font<14),
    samples,
    runtimeErrors:runtimeErrors.length
  };
  console.log(JSON.stringify(result,null,2));
  if(runtimeErrors.length) throw new Error('Runtime exceptions during readability audit');
  if(readabilityFailures.length) throw new Error(`DETAIL_READABILITY_FLOOR_FAILURES ${JSON.stringify(readabilityFailures.slice(0,20))}`);
  console.log('DETAIL READABILITY AUDIT PASS 74/74');
  cdp.close();
}

try { await main(); }
finally {
  proc.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve=>{if(proc.exitCode!==null)resolve();else proc.once('exit',resolve);}),
    sleep(1500)
  ]);
  try { fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}); } catch {}
}
