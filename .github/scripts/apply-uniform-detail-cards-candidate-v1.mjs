import fs from 'node:fs';

const appPath='app.min.js';
let app=fs.readFileSync(appPath,'utf8');
const marker='data-csw-hidden-presentation-live-guard-v1';
if(!app.includes(marker)) throw new Error('HIDDEN_GUARD_MARKER_NOT_FOUND');
const start='\n\n;(()=>{"use strict";const e=document.getElementById("detail-shell");if(!e)return;const t="data-csw-hidden-presentation-live-guard-v1"';
const idx=app.indexOf(start);
if(idx<0) throw new Error('HIDDEN_GUARD_BLOCK_START_NOT_FOUND');
if(app.indexOf(marker,app.indexOf(marker)+1)>=0) throw new Error('HIDDEN_GUARD_MARKER_NOT_UNIQUE');
const suffix=app.slice(idx);
if(!suffix.trim().endsWith('})();')) throw new Error('HIDDEN_GUARD_NOT_TRAILING_BLOCK');
app=app.slice(0,idx).replace(/\s+$/,'')+'\n';
fs.writeFileSync(appPath,app);

const presentationPath='presentation-contract-v1.js';
let src=fs.readFileSync(presentationPath,'utf8');
if(src.includes('UNIVERSAL_FIXED_DETAIL_CARDS_V1')) throw new Error('FIXED_CARD_CONTRACT_ALREADY_PRESENT');
src += String.raw`

;(()=>{
  'use strict';
  const CONTRACT='UNIVERSAL_FIXED_DETAIL_CARDS_V1';
  const shell=document.getElementById('detail-shell');
  if(!shell)return;
  const specs={
    aroma:{label:'香り',kicker:'AROMA / 香り',title:'香り情報は確認できていません',text:'現在の採用資料では、この品種に直接結びつく香りの記述を確認できていません。確認できない香りを親品種や一般的な傾向から推測して補うことはしていません。'},
    terpene:{label:'テルペン',kicker:'TERPENE DATA / テルペン',title:'テルペン情報は確認できていません',text:'現在の採用資料では、この品種に直接結びつく個別テルペンの分析値・成分一覧を確認できていません。香りや他品種の情報から推測して補うことはしていません。'},
    morphology:{label:'形態',kicker:'MORPHOLOGY / 形態',title:'形態情報は確認できていません',text:'現在の採用資料では、この品種の株姿や花の形態を、品種固有の情報として十分に確認できていません。画像や近縁品種から推測して補うことはしていません。'},
    'origin-history':{label:'起源と歴史',kicker:'ORIGIN & HISTORY / 起源と歴史',title:'起源・歴史情報は確認できていません',text:'現在の採用資料では、この品種の起源や歴史を十分に確認できていません。未確認の年代・場所・由来を補って表示することはしていません。'}
  };
  const order=['aroma','terpene','morphology','origin-history','positioning'];
  function bind(root,button,panel){
    if(button.dataset.fixedDetailCardBound===CONTRACT)return;
    button.dataset.fixedDetailCardBound=CONTRACT;
    button.addEventListener('click',event=>{
      event.preventDefault();
      const open=button.getAttribute('aria-expanded')==='true'&&!panel.hidden;
      root.querySelectorAll('[data-ucd-tab]').forEach(item=>{item.setAttribute('aria-expanded','false');item.classList.remove('is-active')});
      root.querySelectorAll('[data-ucd-panel]').forEach(item=>{item.hidden=true});
      if(!open){button.setAttribute('aria-expanded','true');button.classList.add('is-active');panel.hidden=false;}
    });
  }
  function ensure(root,nav,panels,kind){
    if(nav.querySelector('[data-ucd-tab="'+kind+'"]')&&panels.querySelector('[data-ucd-panel="'+kind+'"]'))return false;
    const spec=specs[kind];
    const id='ucd-'+root.dataset.publicDetailId+'-'+kind;
    let button=nav.querySelector('[data-ucd-tab="'+kind+'"]');
    let panel=panels.querySelector('[data-ucd-panel="'+kind+'"]');
    if(!button){
      button=document.createElement('button');button.type='button';button.dataset.ucdTab=kind;button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',id);
      const span=document.createElement('span');span.textContent=spec.label;const chevron=document.createElement('i');chevron.setAttribute('aria-hidden','true');chevron.textContent='⌄';button.append(span,chevron);
    }
    if(!panel){
      panel=document.createElement('section');panel.id=id;panel.dataset.ucdPanel=kind;panel.dataset.profileKind=kind;panel.dataset.unavailableDetailCard='v1';panel.hidden=true;
      const box=document.createElement('div');box.className='ucd-terpene-unavailable ucd-data-unavailable';const kicker=document.createElement('small');kicker.textContent=spec.kicker;const heading=document.createElement('strong');heading.textContent=spec.title;const text=document.createElement('p');text.textContent=spec.text;box.append(kicker,heading,text);panel.append(box);
    }
    nav.append(button);panels.append(panel);bind(root,button,panel);return true;
  }
  function reorder(nav,panels){
    for(const kind of order){const button=nav.querySelector('[data-ucd-tab="'+kind+'"]');const panel=panels.querySelector('[data-ucd-panel="'+kind+'"]');if(button)nav.append(button);if(panel)panels.append(panel);}
  }
  function decorate(){
    const root=shell.querySelector('.detail-public-v1[data-public-detail-id],.ucd-root[data-public-detail-id]');
    if(!root||root.dataset.publicPresentationReady!=='true')return false;
    const profile=root.querySelector('.ucd-profile'),nav=profile?.querySelector('.ucd-profile-nav'),panels=profile?.querySelector('.ucd-profile-panels');
    if(!(profile&&nav&&panels))return false;
    for(const kind of Object.keys(specs))ensure(root,nav,panels,kind);
    reorder(nav,panels);nav.dataset.count=String(nav.querySelectorAll('[data-ucd-tab]').length);root.dataset.fixedDetailCardsV1='true';return true;
  }
  let queued=false;const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>requestAnimationFrame(()=>{queued=false;decorate()}));};
  new MutationObserver(schedule).observe(shell,{childList:true,subtree:true});shell.addEventListener('click',schedule,true);window.addEventListener('popstate',schedule);schedule();setTimeout(schedule,250);setTimeout(schedule,1000);
})();
`;
fs.writeFileSync(presentationPath,src);

const deployPath='.github/workflows/deploy-public-ui-pages.yml';
let deploy=fs.readFileSync(deployPath,'utf8');
const localNeedle="CHROME_BIN=\"$CHROME_BIN\" CSW_BASE_URL='http://127.0.0.1:4173/' node .github/scripts/public-frontend-browser-smoke-v2.mjs\n          echo \"PUBLIC FRONTEND BROWSER SMOKE PASS\"";
const localReplacement="CHROME_BIN=\"$CHROME_BIN\" CSW_BASE_URL='http://127.0.0.1:4173/' node .github/scripts/public-frontend-browser-smoke-v2.mjs\n          CHROME_BIN=\"$CHROME_BIN\" CSW_BASE_URL='http://127.0.0.1:4173/' node .github/scripts/public-detail-card-uniformity-v1.mjs\n          echo \"PUBLIC FRONTEND BROWSER SMOKE PASS\"";
if(deploy.split(localNeedle).length!==2) throw new Error('LOCAL_BROWSER_SMOKE_INSERTION_POINT_MISMATCH');
deploy=deploy.replace(localNeedle,localReplacement);
const liveNeedle="CHROME_BIN=\"$CHROME_BIN\" CSW_BASE_URL='https://cannabis-strain-wisdom.github.io/strain-atlas/' node .github/scripts/public-frontend-browser-smoke-v2.mjs\n          echo \"PUBLIC LIVE BROWSER SMOKE PASS\"";
const liveReplacement="CHROME_BIN=\"$CHROME_BIN\" CSW_BASE_URL='https://cannabis-strain-wisdom.github.io/strain-atlas/' node .github/scripts/public-frontend-browser-smoke-v2.mjs\n          CHROME_BIN=\"$CHROME_BIN\" CSW_BASE_URL='https://cannabis-strain-wisdom.github.io/strain-atlas/' node .github/scripts/public-detail-card-uniformity-v1.mjs\n          echo \"PUBLIC LIVE BROWSER SMOKE PASS\"";
if(deploy.split(liveNeedle).length!==2) throw new Error('LIVE_BROWSER_SMOKE_INSERTION_POINT_MISMATCH');
deploy=deploy.replace(liveNeedle,liveReplacement);
fs.writeFileSync(deployPath,deploy);
