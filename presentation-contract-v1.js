(() => {
  'use strict';
  const CONTRACT = 'UNIVERSAL_PUBLIC_PRESENTATION_CONTRACT_V1';
  const shell = document.getElementById('detail-shell');
  if (!shell) return;
  let catalogPromise;
  const loadCatalog = () => {
    if (window.__CSWRuntimeCatalogPromise && typeof window.__CSWRuntimeCatalogPromise.then === 'function') return Promise.resolve(window.__CSWRuntimeCatalogPromise);
    catalogPromise ||= fetch('runtime/catalog.json', { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error(`catalog HTTP ${response.status}`);
      return response.json();
    });
    return catalogPromise;
  };
  const detailsFor = presentation => {
    if (presentation?.mode === 'layered') return [['.ucd-aroma-core .ucd-aroma-terms', presentation.coreDetails],['.ucd-aroma-accents .ucd-aroma-terms', presentation.accentDetails]];
    if (presentation?.mode === 'profile') return [['.ucd-aroma-single .ucd-aroma-terms', presentation.details]];
    return [];
  };
  const decorateGroup = (root, selector, details) => {
    if (!Array.isArray(details)) return { expected: 0, decorated: 0 };
    const terms = [...root.querySelectorAll(`${selector} > span`)];
    if (terms.length !== details.length) throw new Error(`AROMA_PRESENTATION_SHAPE:${selector}:${terms.length}/${details.length}`);
    let decorated = 0;
    terms.forEach((term, index) => {
      const detail = details[index];
      if (!detail?.reviewLabelJa || !detail?.plainMeaningJa) throw new Error(`AROMA_PRESENTATION_TERM:${selector}:${index}`);
      term.replaceChildren();
      const review = document.createElement('strong'); review.textContent = detail.reviewLabelJa;
      const meaning = document.createElement('small'); meaning.textContent = detail.plainMeaningJa;
      term.append(review, meaning); term.dataset.aromaPublicTerm = 'v1'; decorated += 1;
    });
    return { expected: details.length, decorated };
  };
  const unavailableTerpeneReason = cultivar => {
    const terpene = cultivar?.terpenes;
    if (!terpene || (terpene.status !== 'unknown' && terpene?.presentation?.mode !== 'hidden')) return null;
    const aroma = cultivar?.aromas;
    const aromaSupported = aroma && aroma.status !== 'unknown' && aroma?.presentation?.mode !== 'hidden';
    if (aromaSupported) {
      return {
        title: '個別テルペンは確認できていません',
        text: '香りの情報は確認されていますが、その香りからテルペン成分を推測することはしていません。この品種に直接結びつく個別テルペンの分析値・成分一覧を、現在の採用資料では確認できないため掲載していません。'
      };
    }
    return {
      title: 'テルペン情報は確認できていません',
      text: 'この品種に直接結びつく個別テルペンの分析値・成分一覧を、現在の採用資料では確認できないため掲載していません。確認できない成分を他の品種や香りの情報から推測して補うことはしていません。'
    };
  };
  const addUnavailableTerpene = (root, cultivar) => {
    const reason = unavailableTerpeneReason(cultivar);
    if (!reason || root.querySelector('[data-profile-kind="terpene"]')) return false;
    const profile = root.querySelector('.ucd-profile');
    const nav = profile?.querySelector('.ucd-profile-nav');
    const panels = profile?.querySelector('.ucd-profile-panels');
    if (!profile || !nav || !panels) return false;
    const id = `ucd-${cultivar.id}-terpene`;
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.ucdTab = 'terpene'; button.setAttribute('aria-expanded','false'); button.setAttribute('aria-controls',id);
    const label = document.createElement('span'); label.textContent = 'テルペン';
    const chevron = document.createElement('i'); chevron.setAttribute('aria-hidden','true'); chevron.textContent = '⌄';
    button.append(label, chevron);
    const panel = document.createElement('section'); panel.id = id; panel.dataset.ucdPanel = 'terpene'; panel.dataset.profileKind = 'terpene'; panel.dataset.terpeneUnavailable = 'v1'; panel.hidden = true;
    const box = document.createElement('div'); box.className = 'ucd-terpene-unavailable';
    const kicker = document.createElement('small'); kicker.textContent = 'TERPENE DATA / テルペン';
    const heading = document.createElement('strong'); heading.textContent = reason.title;
    const text = document.createElement('p'); text.textContent = reason.text;
    box.append(kicker, heading, text); panel.append(box); nav.append(button); panels.append(panel);
    nav.dataset.count = String(nav.querySelectorAll('[data-ucd-tab]').length);
    button.addEventListener('click', event => {
      event.preventDefault();
      const isOpen = button.getAttribute('aria-expanded') === 'true' && !panel.hidden;
      root.querySelectorAll('[data-ucd-tab]').forEach(item => { item.setAttribute('aria-expanded','false'); item.classList.remove('is-active'); });
      root.querySelectorAll('[data-ucd-panel]').forEach(item => { item.hidden = true; });
      if (!isOpen) { button.setAttribute('aria-expanded','true'); button.classList.add('is-active'); panel.hidden = false; }
    });
    return true;
  };
  const processed = new WeakSet();
  const govern = async () => {
    const root = shell.querySelector('.ucd-root[data-public-detail-id][data-universal-detail-version="UNIVERSAL_CULTIVAR_DETAIL_V1"]');
    if (!root || processed.has(root)) return;
    root.dataset.publicPresentationReady = 'false';
    const catalog = await loadCatalog();
    const cultivar = catalog?.cultivars?.find(item => item?.id === root.dataset.publicDetailId);
    if (!cultivar) throw new Error(`PUBLIC_CULTIVAR_MISSING:${root.dataset.publicDetailId}`);
    if (cultivar?.publicPresentation?.contractVersion !== CONTRACT) throw new Error(`PUBLIC_CONTRACT_MISSING:${root.dataset.publicDetailId}`);
    let expected = 0, decorated = 0;
    for (const [selector, details] of detailsFor(cultivar?.aromas?.presentation)) {
      const result = decorateGroup(root, selector, details); expected += result.expected; decorated += result.decorated;
    }
    if (expected !== decorated) throw new Error(`AROMA_PRESENTATION_INCOMPLETE:${decorated}/${expected}`);
    if (decorated) root.dataset.aromaTerminologyReady = 'true';
    const terpeneUnavailable = addUnavailableTerpene(root, cultivar);
    root.dataset.publicPresentationReady = 'true';
    processed.add(root);
    window.__CSWPublicPresentationContractV1 = { status: 'PASS', contractVersion: CONTRACT, cultivarId: cultivar.id, aromaTerms: decorated, terpeneUnavailable };
  };
  const style = document.createElement('style');
  style.id = 'public-presentation-contract-v1-style';
  style.textContent = `
    #detail-shell:not(:has(.ucd-root[data-public-presentation-ready="true"])) > :not(.detail-topbar) { visibility:hidden!important; }
    .ucd-aroma-terms span[data-aroma-public-term="v1"] { align-items:flex-start;flex-direction:column;justify-content:center;line-height:1.35; }
    .ucd-aroma-terms span[data-aroma-public-term="v1"] strong { color:inherit;font:inherit; }
    .ucd-aroma-terms span[data-aroma-public-term="v1"] small { color:#93a098;font-size:9px;font-weight:650;letter-spacing:0; }
    .ucd-lineage summary > .ucd-grade { display:inline-flex;flex:0 0 auto;width:auto;min-width:0;max-width:max-content;min-height:18px;padding:2px 5px;align-self:center;justify-self:end;white-space:nowrap;font-size:8px;font-weight:750;letter-spacing:.02em;opacity:.76; }
    .ucd-terpene-unavailable { padding:18px 16px;border:1px solid rgba(216,189,98,.14);border-radius:14px;background:rgba(255,255,255,.018); }
    .ucd-terpene-unavailable > small { display:block;margin-bottom:8px;color:#d8bd62;font-size:9px;font-weight:900;letter-spacing:.1em; }
    .ucd-terpene-unavailable > strong { display:block;margin-bottom:8px;color:#dfe7e1;font-size:13px; }
    .ucd-terpene-unavailable > p { margin:0;color:#93a098;font-size:10px;line-height:1.75; }
  `;
  document.head.appendChild(style);
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return; scheduled = true;
    queueMicrotask(() => { scheduled = false; govern().catch(error => {
      window.__CSWPublicPresentationContractV1 = { status: 'FAIL_CLOSED', error: String(error?.message || error) };
      console.error('PUBLIC_PRESENTATION_CONTRACT_V1', error);
    }); });
  };
  new MutationObserver(schedule).observe(shell, { childList: true });
  schedule();
})();
