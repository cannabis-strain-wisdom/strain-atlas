(()=>{"use strict";
const shell=document.getElementById("detail-shell");
if(!shell)return;
const styleId="rush-of-siam-balance-tune-v1";
if(!document.getElementById(styleId)){
  const style=document.createElement("style");
  style.id=styleId;
  style.textContent=`
    .detail-public-v1[data-public-detail-id="rush-of-siam"] .rush-spec-kicker{
      color:#cdb66f!important;
      font-family:ui-serif,Georgia,"Times New Roman",serif!important;
      font-size:9.5px!important;
      font-weight:700!important;
      letter-spacing:.17em!important;
      line-height:1.15!important;
    }
    .detail-public-v1[data-public-detail-id="rush-of-siam"] .rush-ratio-head{
      grid-template-columns:minmax(0,1fr) minmax(96px,auto) minmax(0,1fr)!important;
      align-items:center!important;
      gap:12px!important;
      margin-bottom:10px!important;
    }
    .detail-public-v1[data-public-detail-id="rush-of-siam"] .rush-quick-type.rush-hybrid-emblem{
      grid-column:2!important;
      display:flex!important;
      flex-direction:column!important;
      align-items:center!important;
      justify-content:center!important;
      gap:3px!important;
      min-width:96px!important;
      min-height:46px!important;
      margin:0!important;
      padding:7px 13px 6px!important;
      border:1px solid rgba(222,191,102,.48)!important;
      border-radius:999px!important;
      background:radial-gradient(circle at 50% 0%,rgba(228,203,127,.16),rgba(228,203,127,.035) 56%,rgba(5,14,9,.28) 100%)!important;
      box-shadow:0 0 18px rgba(217,182,93,.08),inset 0 1px 0 rgba(255,255,255,.045)!important;
      white-space:nowrap!important;
    }
    .detail-public-v1[data-public-detail-id="rush-of-siam"] .rush-hybrid-main{
      color:#e4cb7f;
      font-size:12.5px;
      font-weight:900;
      letter-spacing:.14em;
      line-height:1;
    }
    .detail-public-v1[data-public-detail-id="rush-of-siam"] .rush-hybrid-sub{
      color:#9eaba3;
      font-size:7.5px;
      font-weight:800;
      letter-spacing:.13em;
      line-height:1;
    }
    @media(max-width:370px){
      .detail-public-v1[data-public-detail-id="rush-of-siam"] .rush-spec-kicker{font-size:8.6px!important;letter-spacing:.14em!important}
      .detail-public-v1[data-public-detail-id="rush-of-siam"] .rush-ratio-head{grid-template-columns:minmax(0,1fr) minmax(86px,auto) minmax(0,1fr)!important;gap:7px!important}
      .detail-public-v1[data-public-detail-id="rush-of-siam"] .rush-quick-type.rush-hybrid-emblem{min-width:86px!important;min-height:42px!important;padding:6px 9px 5px!important}
      .detail-public-v1[data-public-detail-id="rush-of-siam"] .rush-hybrid-main{font-size:11.5px}
      .detail-public-v1[data-public-detail-id="rush-of-siam"] .rush-hybrid-sub{font-size:6.8px}
    }
  `;
  document.head.appendChild(style);
}
function tuneRush(){
  const root=shell.querySelector('.detail-public-v1[data-public-detail-id="rush-of-siam"]');
  if(!root)return;
  const ratio=root.querySelector(".rush-ratio-card");
  const cannabinoid=root.querySelector(".rush-cannabinoid-card");
  if(!ratio||!cannabinoid)return;
  const ratioKicker=ratio.querySelector(".rush-spec-kicker");
  const cannabinoidKicker=cannabinoid.querySelector(".rush-spec-kicker");
  if(ratioKicker)ratioKicker.textContent="GENETIC BALANCE";
  if(cannabinoidKicker)cannabinoidKicker.textContent="CANNABINOID PROFILE";
  const center=ratio.querySelector(".rush-quick-type");
  if(center&&!center.classList.contains("rush-hybrid-emblem")){
    center.classList.add("rush-hybrid-emblem");
    const main=document.createElement("span");
    main.className="rush-hybrid-main";
    main.textContent="HYBRID";
    const sub=document.createElement("span");
    sub.className="rush-hybrid-sub";
    sub.textContent="SATIVA LEANING";
    center.replaceChildren(main,sub);
  }
}
new MutationObserver(()=>queueMicrotask(tuneRush)).observe(shell,{childList:true,subtree:true});
queueMicrotask(tuneRush);
})();
// pages-artifact-refresh-20260902
