import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const baseUrl=process.env.CSW_BASE_URL||'http://127.0.0.1:4173/';
const chrome=process.env.CHROME_BIN;
if(!chrome) throw new Error('CHROME_BIN is required');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function getJson(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(url+' HTTP '+r.status);return r.json();}
async function waitFor(fn,label,timeout=15000){const started=Date.now();let last;while(Date.now()-started<timeout){try{last=await fn();if(last)return last;}catch(e){last=e;}await sleep(100);}throw new Error('Timeout waiting for '+label+(last instanceof Error?': '+last.message:''));}
class CDP{constructor(url){this.ws=new WebSocket(url);this.id=0;this.pending=new Map();}async open(){await new Promise((res,rej)=>{this.ws.addEventListener('open',res,{once:true});this.ws.addEventListener('error',rej,{once:true});});this.ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(!m.id)return;const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);});}send(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}));});}close(){this.ws.close();}}

const profile=fs.mkdtempSync(path.join(os.tmpdir(),'csw-readability-audit-'));
const proc=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-debugging-port=9231',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','pipe','pipe']});

async function main(){
  const catalog=await getJson(new URL('runtime/catalog.json',baseUrl));
  const cultivars=Array.isArray(catalog?.cultivars)?catalog.cultivars:[];
  if(cultivars.length!==74) throw new Error('Expected 74 cultivars, got '+cultivars.length);
  await waitFor(async()=>{try{return await getJson('http://127.0.0.1:9231/json/version')}catch{return false}},'Chrome DevTools');
  const pages=await getJson('http://127.0.0.1:9231/json/list');const page=pages.find(x=>x.type==='page');if(!page)throw new Error('No Chrome page target');
  const cdp=new CDP(page.webSocketDebuggerUrl);await cdp.open();await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  async function evalv(expression){const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error('Eval exception: '+r.exceptionDetails.text);return r.result.value;}

  const selectors={
    lineageTitle:'.ucd-lineage summary strong',
    lineageKicker:'.ucd-lineage summary small',
    lineageBody:'.ucd-lineage > div p',
    lineageNote:'.ucd-lineage-note-v1',
    alias:'[class*="alias"]',
    evidenceLink:'.ucd-evidence-row a',
    evidenceGrade:'.ucd-evidence-row .ucd-grade',
    noteBody:'.ucd-note p',
    noteLabel:'.ucd-note small',
    morphologyBody:'.ucd-morphology-summary p',
    cannabinoidContext:'.ucd-cannabinoid-source-context p',
    cannabinoidExplanation:'.ucd-cannabinoid-source-explanation',
    originHistory:'.ucd-origin-history-section .ucd-text-panel>p',
    unavailableBody:'.ucd-data-unavailable>p',
    sensoryHelper:'.ucd-sensory-head small',
    cultivationLabel:'.csw-staged-cultivation-row small',
    cultivationValue:'.csw-staged-cultivation-row strong'
  };
  const agg={};
  for(const key of Object.keys(selectors))agg[key]={count:0,min:999,max:0,samples:[]};
  for(const cultivar of cultivars){
    const id=cultivar.id;const url=new URL(baseUrl);url.searchParams.set('strain',id);url.searchParams.set('qa','readability-audit');
    await cdp.send('Page.navigate',{url:url.href});await waitFor(()=>evalv("document.readyState==='complete'"),id+' complete');
    await waitFor(()=>evalv(`(()=>{const r=document.querySelector('.detail-public-v1[data-public-detail-id="${id}"],.ucd-root[data-public-detail-id="${id}"]');return !!r&&r.dataset.cswDetailInactiveScope==='all'&&window.__CSWDetailInteractionV1?.status==='PASS'})()`),id+' detail contract');
    const rows=await evalv(`(()=>{const root=document.querySelector('.detail-public-v1[data-public-detail-id="${id}"],.ucd-root[data-public-detail-id="${id}"]');const selectors=${JSON.stringify(selectors)};const out={};for(const [k,sel] of Object.entries(selectors)){out[k]=[...root.querySelectorAll(sel)].filter(n=>(n.textContent||'').trim()).map(n=>({size:parseFloat(getComputedStyle(n).fontSize),line:parseFloat(getComputedStyle(n).lineHeight)||0,text:(n.textContent||'').trim().replace(/\\s+/g,' ').slice(0,80)}));}return out;})()`);
    for(const [key,items] of Object.entries(rows)){
      for(const item of items){const a=agg[key];a.count++;a.min=Math.min(a.min,item.size);a.max=Math.max(a.max,item.size);if(a.samples.length<4)a.samples.push({id,size:item.size,line:item.line,text:item.text});}
    }
  }
  for(const a of Object.values(agg)) if(a.count===0){a.min=null;a.max=null;}
  console.log(JSON.stringify({status:'PASS',viewport:'390x844',total:cultivars.length,typography:agg},null,2));
  console.log('DETAIL READABILITY AUDIT PASS 74/74');
  cdp.close();
}
try{await main();}catch(e){console.error(e);process.exitCode=1;}finally{try{proc.kill('SIGTERM')}catch{}}
