import fs from 'node:fs';

const path='presentation-contract-v1.js';
let src=fs.readFileSync(path,'utf8');
if(src.includes('UNIVERSAL_FIXED_PRIMARY_CARDS_V1')) throw new Error('FIXED_PRIMARY_CONTRACT_ALREADY_PRESENT');
src += String.raw`

;(()=>{
  'use strict';
  const CONTRACT='UNIVERSAL_FIXED_PRIMARY_CARDS_V1';
  const shell=document.getElementById('detail-shell');
  if(!shell)return;
  const specs={
    type:{label:'タイプ',value:'未確認',kicker:'TYPE / タイプ',title:'タイプ情報は確認できていません',text:'現在の採用資料では、この品種のタイプを十分な根拠で確認できていません。数値比率や近縁品種から推測して補うことはしていません。'},
    cannabinoid:{label:'カンナビノイド',value:'未確認',kicker:'CANNABINOIDS / カンナビノイド',title:'カンナビノイド情報は確認できていません',text:'現在の採用資料では、この品種に直接結びつくカンナビノイド情報を十分に確認できていません。未確認の数値や一般的な傾向を補って表示することはしていません。'}
  };
  function bind(nav,panels){
    if(nav.dataset.fixedPrimaryFallbackBound===CONTRACT)return;
    nav.dataset.fixedPrimaryFallbackBound=CONTRACT;
    nav.addEventListener('click',event=>{
      const button=event.target.closest('[data-ucd-primary-tab]');
      if(!button||!nav.contains(button))return;
      event.preventDefault();
      const kind=button.dataset.ucdPrimaryTab;
      const panel=panels.querySelector('[data-ucd-primary-panel="'+CSS.escape(kind)+'"]');
      const open=button.getAttribute('aria-expanded')==='true'&&panel&&!panel.hidden;
      nav.querySelectorAll('[data-ucd-primary-tab]').forEach(item=>{item.setAttribute('aria-expanded','false');item.classList.remove('is-active')});
      panels.querySelectorAll('[data-ucd-primary-panel]').forEach(item=>{item.hidden=true});
      if(!open&&panel){button.setAttribute('aria-expanded','true');button.classList.add('is-active');panel.hidden=false;}
    });
  }
  function ensureControls(root){
    let controls=root.querySelector('.ucd-primary-controls');
    let created=false;
    if(!controls){
      controls=document.createElement('section');controls.className='ucd-primary-controls';controls.dataset.compactPrimaryControls='v1';controls.dataset.fixedPrimaryControls='v1';
      const nav=document.createElement('nav');nav.className='ucd-primary-nav';nav.setAttribute('aria-label','基本情報');
      const panels=document.createElement('div');panels.className='ucd-primary-panels';
      controls.append(nav,panels);
      const specs=root.querySelector('.ucd-specs');
      if(specs)specs.replaceWith(controls);else{const profile=root.querySelector('.ucd-profile');profile?profile.insertAdjacentElement('beforebegin',controls):root.append(controls);}
      bind(nav,panels);created=true;
    }
    return {controls,created};
  }
  function ensureKind(root,controls,kind){
    const nav=controls.querySelector('.ucd-primary-nav'),panels=controls.querySelector('.ucd-primary-panels');
    if(!(nav&&panels))return false;
    if(nav.querySelector('[data-ucd-primary-tab="'+kind+'"]')&&panels.querySelector('[data-ucd-primary-panel="'+kind+'"]'))return false;
    const spec=specs[kind],id='ucd-'+root.dataset.publicDetailId+'-primary-'+kind;
    let button=nav.querySelector('[data-ucd-primary-tab="'+kind+'"]');
    let panel=panels.querySelector('[data-ucd-primary-panel="'+kind+'"]');
    if(!button){
      button=document.createElement('button');button.type='button';button.dataset.ucdPrimaryTab=kind;button.dataset.fixedPrimaryPlaceholder='v1';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',id);
      const copy=document.createElement('span');copy.className='ucd-primary-nav-copy';const label=document.createElement('small');label.textContent=spec.label;const value=document.createElement('strong');value.textContent=spec.value;const chevron=document.createElement('i');chevron.setAttribute('aria-hidden','true');chevron.textContent='⌄';copy.append(label,value);button.append(copy,chevron);
    }
    if(!panel){
      panel=document.createElement('section');panel.id=id;panel.className='ucd-primary-panel';panel.dataset.ucdPrimaryPanel=kind;panel.dataset.fixedPrimaryPlaceholder='v1';panel.hidden=true;
      const box=document.createElement('div');box.className='ucd-terpene-unavailable ucd-data-unavailable';const kicker=document.createElement('small');kicker.textContent=spec.kicker;const heading=document.createElement('strong');heading.textContent=spec.title;const text=document.createElement('p');text.textContent=spec.text;box.append(kicker,heading,text);panel.append(box);
    }
    nav.append(button);panels.append(panel);return true;
  }
  function reorder(controls){
    const nav=controls.querySelector('.ucd-primary-nav'),panels=controls.querySelector('.ucd-primary-panels');if(!(nav&&panels))return;
    for(const kind of ['type','cannabinoid']){const b=nav.querySelector('[data-ucd-primary-tab="'+kind+'"]'),p=panels.querySelector('[data-ucd-primary-panel="'+kind+'"]');if(b)nav.append(b);if(p)panels.append(p);}
    nav.dataset.count=String(nav.querySelectorAll('[data-ucd-primary-tab]').length);
  }
  function decorate(){
    const root=shell.querySelector('.detail-public-v1[data-public-detail-id],.ucd-root[data-public-detail-id]');
    if(!root||root.dataset.publicPresentationReady!=='true'||root.dataset.fixedDetailCardsV1!=='true')return false;
    const {controls,created}=ensureControls(root);if(!controls)return false;
    for(const kind of Object.keys(specs))ensureKind(root,controls,kind);
    if(created)bind(controls.querySelector('.ucd-primary-nav'),controls.querySelector('.ucd-primary-panels'));
    reorder(controls);root.dataset.fixedPrimaryCardsV1='true';return true;
  }
  let queued=false;const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>requestAnimationFrame(()=>{queued=false;decorate()}));};
  new MutationObserver(schedule).observe(shell,{childList:true,subtree:true});shell.addEventListener('click',schedule,true);window.addEventListener('popstate',schedule);schedule();setTimeout(schedule,250);setTimeout(schedule,1000);
})();
`;
fs.writeFileSync(path,src);
