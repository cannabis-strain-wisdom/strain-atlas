(() => {
  'use strict';

  const shell = document.getElementById('detail-shell');
  if (!shell) return;

  let catalogPromise;
  const loadCatalog = () => {
    catalogPromise ||= fetch('runtime/catalog.json', { cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error(`catalog HTTP ${response.status}`);
        return response.json();
      });
    return catalogPromise;
  };

  const detailsFor = presentation => {
    if (presentation?.mode === 'layered') {
      return [
        ['.ucd-aroma-core .ucd-aroma-terms', presentation.coreDetails],
        ['.ucd-aroma-accents .ucd-aroma-terms', presentation.accentDetails],
      ];
    }
    if (presentation?.mode === 'profile') {
      return [['.ucd-aroma-single .ucd-aroma-terms', presentation.details]];
    }
    return [];
  };

  const decorateGroup = (root, selector, details) => {
    if (!Array.isArray(details)) return 0;
    const terms = [...root.querySelectorAll(`${selector} > span`)];
    if (terms.length !== details.length) return 0;
    let count = 0;
    terms.forEach((term, index) => {
      const detail = details[index];
      if (!detail?.reviewLabelJa || !detail?.plainMeaningJa) return;
      term.replaceChildren();
      const review = document.createElement('strong');
      review.textContent = detail.reviewLabelJa;
      const meaning = document.createElement('small');
      meaning.textContent = detail.plainMeaningJa;
      term.append(review, meaning);
      term.dataset.aromaPublicTerm = 'v1';
      count += 1;
    });
    return count;
  };

  const decorate = async () => {
    const root = shell.querySelector('.detail-public-v1[data-public-detail-id]');
    if (!root || root.dataset.aromaTerminologyReady === 'true') return;
    const catalog = await loadCatalog();
    const cultivar = catalog?.cultivars?.find(item => item?.id === root.dataset.publicDetailId);
    const presentation = cultivar?.aromas?.presentation;
    let count = 0;
    for (const [selector, details] of detailsFor(presentation)) {
      count += decorateGroup(root, selector, details);
    }
    if (count) root.dataset.aromaTerminologyReady = 'true';
  };

  const style = document.createElement('style');
  style.textContent = `
    .ucd-aroma-terms span[data-aroma-public-term="v1"] {
      align-items: flex-start;
      flex-direction: column;
      justify-content: center;
      line-height: 1.35;
    }
    .ucd-aroma-terms span[data-aroma-public-term="v1"] strong {
      color: inherit;
      font: inherit;
    }
    .ucd-aroma-terms span[data-aroma-public-term="v1"] small {
      color: #93a098;
      font-size: 9px;
      font-weight: 650;
      letter-spacing: 0;
    }
  `;
  document.head.appendChild(style);

  const schedule = () => queueMicrotask(() => decorate().catch(error => {
    console.error('PUBLIC_PRESENTATION_CONTRACT_V1', error);
  }));
  new MutationObserver(schedule).observe(shell, { childList: true, subtree: true });
  schedule();
})();
