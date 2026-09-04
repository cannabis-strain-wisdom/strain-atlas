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
    root.dataset.publicPresentationReady = 'true';
    processed.add(root);
    window.__CSWPublicPresentationContractV1 = { status: 'PASS', contractVersion: CONTRACT, cultivarId: cultivar.id, aromaTerms: decorated };
  };
  const style = document.createElement('style');
  style.id = 'public-presentation-contract-v1-style';
  style.textContent = `
    #detail-shell:not(:has(.ucd-root[data-public-presentation-ready="true"])) > :not(.detail-topbar) { visibility:hidden!important; }
    .ucd-aroma-terms span[data-aroma-public-term="v1"] { align-items:flex-start;flex-direction:column;justify-content:center;line-height:1.35; }
    .ucd-aroma-terms span[data-aroma-public-term="v1"] strong { color:inherit;font:inherit; }
    .ucd-aroma-terms span[data-aroma-public-term="v1"] small { color:#93a098;font-size:9px;font-weight:650;letter-spacing:0; }
    .ucd-lineage summary > .ucd-grade { min-height:18px;padding:2px 5px;font-size:8px;font-weight:750;letter-spacing:.02em;opacity:.76; }
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
