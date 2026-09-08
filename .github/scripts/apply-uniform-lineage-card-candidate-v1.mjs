import fs from 'node:fs';

const path='presentation-contract-v1.js';
let src=fs.readFileSync(path,'utf8');
if(src.includes('UNIVERSAL_FIXED_LINEAGE_CARD_V1')) throw new Error('FIXED_LINEAGE_CONTRACT_ALREADY_PRESENT');
src += String.raw`

;(()=>{
  'use strict';
  const CONTRACT='UNIVERSAL_FIXED_LINEAGE_CARD_V1';
  const shell=document.getElementById('detail-shell');
  if(!shell)return;
  function decorate(){
    const root=shell.querySelector('.detail-public-v1[data-public-detail-id],.ucd-root[data-public-detail-id]');
    if(!root||root.dataset.publicPresentationReady!=='true'||root.dataset.fixedPrimaryCardsV1!=='true')return false;
    const heroCopy=shell.querySelector('.ucd-hero .detail-hero-copy,.public-detail-hero .public-hero-copy');
    if(!heroCopy)return false;
    if(!heroCopy.querySelector('.ucd-lineage')){
      const details=document.createElement('details');details.className='ucd-lineage';details.dataset.lineageUnavailable='v1';
      const summary=document.createElement('summary');const span=document.createElement('span');const small=document.createElement('small');small.textContent='LINEAGE / 系譜';const strong=document.createElement('strong');strong.textContent='系譜情報は確認できていません';const chevron=document.createElement('i');chevron.setAttribute('aria-hidden','true');chevron.textContent='⌄';span.append(small,strong);summary.append(span,chevron);
      const body=document.createElement('div');const text=document.createElement('p');text.textContent='現在の採用資料では、この品種の直接系譜を十分な根拠で確認できていません。近縁品種や一般的な情報から親品種を推測して補うことはしていません。';body.append(text);details.append(summary,body);heroCopy.append(details);
    }
    root.dataset.fixedLineageCardV1='true';return true;
  }
  let queued=false;const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>requestAnimationFrame(()=>{queued=false;decorate()}));};
  new MutationObserver(schedule).observe(shell,{childList:true,subtree:true});shell.addEventListener('click',schedule,true);window.addEventListener('popstate',schedule);schedule();setTimeout(schedule,250);setTimeout(schedule,1000);
})();
`;
fs.writeFileSync(path,src);
