import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const baseUrl=process.env.CSW_BASE_URL||'http://127.0.0.1:4173/';
const chrome=process.env.CHROME_BIN;
if(!chrome) throw new Error('CHROME_BIN is required');
const raw=JSON.parse(fs.readFileSync('runtime/catalog.json','utf8'));
const expected=new Map((raw.cultivars||[]).filter(x=>x?.publicPresentation?.state==='CURRENT').map(x=>[x.id,x]));
if(!expected.size) throw new Error('NO_CURRENT_CULTIVARS');

const profile=fs.mkdtempSync(path.join(os.tmpdir(),'csw-current-authority-'));
const proc=spawn(chrome,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-debugging-port=9224',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','pipe','pipe']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function getJson(url){const r=await fetch(url);if(!r.ok)throw new Error(`${url} HTTP ${r.status}`);return r.json()}
async function wait(fn,label,timeout=20000){const start=Date.now();let last;while(Date.now()-start<timeout){try{last=await fn();if(last)return last}catch(e){last=e}await sleep(100)}throw new Error(`Timeout ${label}${last instanceof Error?`: ${last.message}`:''}`)}
class CDP{constructor(url){this.ws=new WebSocket(url);this.id=0;this.pending=new Map;this.exceptions=[]}async open(){await new Promise((r,j)=>{this.ws.addEventListener('open',r,{once:true});this.ws.addEventListener('error',j,{once:true})});this.ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')this.exceptions.push(m)})}send(method,params={}){const id=++this.id;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}))})}close(){this.ws.close()}}

let cdp;
try{
  await wait(async()=>{try{return await getJson('http://127.0.0.1:9224/json/version')}catch{return false}},'devtools');
  const page=(await getJson('http://127.0.0.1:9224/json/list')).find(x=>x.type==='page');
  assert.ok(page);
  cdp=new CDP(page.webSocketDebuggerUrl);await cdp.open();await cdp.send('Page.enable');await cdp.send('Runtime.enable');
  const ev=async expression=>{const r=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value};
  await cdp.send('Page.navigate',{url:`${baseUrl}?authority=${Date.now()}`});
  await wait(()=>ev(`document.readyState==='complete'`),'document');
  const runtimeJson=await wait(()=>ev(`(async()=>JSON.stringify(await window.__CSWRuntimeCatalogPromise))()`),'runtime catalog');
  const runtime=JSON.parse(runtimeJson);
  const actual=new Map((runtime?.cultivars||[]).map(x=>[x.id,x]));
  const failures=[];
  for(const [id,want] of expected){
    const got=actual.get(id);
    try{assert.deepEqual(got,want)}catch(e){failures.push({id,message:e.message})}
  }
  if(failures.length) throw new Error(`CURRENT_RUNTIME_DIVERGENCE ${JSON.stringify(failures)}`);
  assert.equal(cdp.exceptions.length,0,`runtime exceptions ${cdp.exceptions.length}`);
  console.log(`CURRENT RUNTIME AUTHORITY PASS ${expected.size}/${expected.size}`);
} finally {
  try{cdp?.close()}catch{}
  try{proc.kill('SIGTERM')}catch{}
  await sleep(300);
  try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100})}catch{}
}
