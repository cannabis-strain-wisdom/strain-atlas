(() => {
  'use strict';
  const CONTRACT = 'UNIVERSAL_PUBLIC_PRESENTATION_CONTRACT_V1';
  const shell = document.getElementById('detail-shell');
  if (!shell) return;
  let catalogPromise;
  const loadCatalog = () => {
    if (window.__CSWRuntimeCatalogPromise && typeof window.__CSWRuntimeCatalogPromise.then === 'function') return Promise.resolve(window.__CSWRuntimeCatalogPromise);
    catalogPromise ||= fetch('runtime/catalog.json', { cache: 'no-store' }).then(response => { if (!response.ok) throw new Error(`catalog HTTP ${response.status}`); return response.json(); });
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
    terms.forEach((term, index) => {
      const detail = details[index];
      if (!detail?.reviewLabelJa || !detail?.plainMeaningJa) throw new Error(`AROMA_PRESENTATION_TERM:${selector}:${index}`);
      term.replaceChildren();
      const review = document.createElement('strong'); review.textContent = detail.reviewLabelJa;
      const meaning = document.createElement('small'); meaning.textContent = detail.plainMeaningJa;
      term.append(review, meaning); term.dataset.aromaPublicTerm = 'v1';
    });
    return { expected: details.length, decorated: terms.length };
  };
  const sourceDeclaredCannabinoidSummary = cultivar => {
    const items = Array.isArray(cultivar?.cannabinoids?.presentation?.items) ? cultivar.cannabinoids.presentation.items : [];
    const declarations = items.filter(item => item?.evidenceType === 'SOURCE_DECLARED_NUMERIC' && Number.isFinite(item?.value) && item?.unit === '%');
    if (!declarations.length) return null;
    const values = declarations.map(item => item.value);
    const scopes = new Set(declarations.map(item => item.evidenceScopeRef).filter(Boolean));
    return {
      count: declarations.length,
      scopeCount: scopes.size || declarations.length,
      min: Math.min(...values),
      max: Math.max(...values),
      sampleScoped: declarations.every(item => item.evidenceScope === 'sample'),
      unverified: declarations.every(item => item.analysisVerified === false)
    };
  };
  const decorateSourceDeclaredCannabinoids = (root, cultivar) => {
    const summary = sourceDeclaredCannabinoidSummary(cultivar);
    if (!summary) return false;
    const section = root.querySelector('.ucd-cannabinoid-card');
    if (!section) throw new Error(`CANNABINOID_CARD_MISSING:${cultivar.id}`);
    if (section.querySelector('[data-cannabinoid-source-context="v1"]')) return true;

    const context = document.createElement('div');
    context.className = 'ucd-cannabinoid-source-context';
    context.dataset.cannabinoidSourceContext = 'v1';
    const top = document.createElement('div'); top.className = 'ucd-cannabinoid-source-context-top';
    const label = document.createElement('strong'); label.textContent = summary.sampleScoped ? '公式掲載の検体データ' : '公式掲載データ';
    const range = document.createElement('span'); range.textContent = summary.min === summary.max ? `${summary.min}%` : `掲載値 ${summary.min}〜${summary.max}%`;
    top.append(label, range);
    const note = document.createElement('p');
    const countText = summary.sampleScoped ? `${summary.scopeCount}検体・${summary.count}件の公式掲載値です。` : `${summary.count}件の公式掲載値です。`;
    const verificationText = summary.unverified ? '元の分析書そのものはCSWで直接確認できていないため、分析確認済みの測定値としては扱っていません。' : '';
    note.textContent = `${countText}品種全体の固定値を示すものではありません。${verificationText}`;
    context.append(top, note);

    const grid = section.querySelector('.ucd-cannabinoid-grid');
    if (!grid) throw new Error(`CANNABINOID_GRID_MISSING:${cultivar.id}`);
    grid.dataset.sourceDeclaredIndividualValues = 'v1';
    grid.insertAdjacentElement('beforebegin', context);

    const detail = section.querySelector('.ucd-spec-detail');
    if (detail) {
      [...detail.querySelectorAll(':scope > p')].forEach(paragraph => {
        const text = paragraph.textContent || '';
        if (text.includes('公式掲載値（分析未確認）') || text.includes('含有量は個体・栽培条件・分析ロット')) paragraph.remove();
      });
      const explanation = document.createElement('p');
      explanation.className = 'ucd-cannabinoid-source-explanation';
      explanation.textContent = '個別の掲載値は上のカードを開いた時だけ表示しています。同じ検体の再検査を含むため、5つの数値を品種の固定THC値としてまとめていません。';
      detail.prepend(explanation);
    }
    section.dataset.sourceDeclaredCannabinoids = 'v1';
    return true;
  };
  const decorateUnavailableRatio = (root, cultivar) => {
    const ratio = cultivar?.classification?.ratio;
    const hasFormalRatio = Boolean(ratio && ['confirmed', 'disputed'].includes(ratio.status) && ratio.measurement);
    if (hasFormalRatio) return false;
    const section = root.querySelector('.ucd-type-only');
    if (!section) return false;
    if (section.querySelector('[data-ratio-unavailable="v1"]')) return true;
    const note = document.createElement('p');
    note.className = 'ucd-ratio-unavailable';
    note.dataset.ratioUnavailable = 'v1';
    note.textContent = '現在の採用資料では、サティバ／インディカの数値比率は確認できていません。';
    section.append(note);
    section.dataset.ratioUnavailable = 'v1';
    return true;
  };
  const clarifyListedTerpenes = (root, cultivar) => {
    if (cultivar?.terpenes?.evidenceMode !== 'LISTED') return false;
    const panel = root.querySelector('[data-profile-kind="terpene"]');
    const paragraph = panel?.querySelector('p');
    if (!paragraph) return false;
    paragraph.textContent = '公式資料で個別のテルペン名が確認されています。個別の含有量や順位は確認できていないため、成分名のみ掲載しています。';
    panel.dataset.terpeneListedClarified = 'v1';
    return true;
  };
  const unavailableTerpeneReason = cultivar => {
    const terpene = cultivar?.terpenes;
    if (!terpene || (terpene.status !== 'unknown' && terpene?.presentation?.mode !== 'hidden')) return null;
    const aroma = cultivar?.aromas;
    const supported = aroma && aroma.status !== 'unknown' && aroma?.presentation?.mode !== 'hidden';
    return supported
      ? { title: '個別テルペンは確認できていません', text: '香りの情報は確認されていますが、その香りからテルペン成分を推測することはしていません。この品種に直接結びつく個別テルペンの分析値・成分一覧を、現在の採用資料では確認できないため掲載していません。' }
      : { title: 'テルペン情報は確認できていません', text: 'この品種に直接結びつく個別テルペンの分析値・成分一覧を、現在の採用資料では確認できないため掲載していません。確認できない成分を他の品種や香りの情報から推測して補うことはしていません。' };
  };
  const addUnavailableTerpene = (root, cultivar) => {
    const reason = unavailableTerpeneReason(cultivar);
    if (!reason || root.querySelector('[data-profile-kind="terpene"]')) return false;
    const profile = root.querySelector('.ucd-profile'), nav = profile?.querySelector('.ucd-profile-nav'), panels = profile?.querySelector('.ucd-profile-panels');
    if (!profile || !nav || !panels) return false;
    const id = `ucd-${cultivar.id}-terpene`, button = document.createElement('button');
    button.type = 'button'; button.dataset.ucdTab = 'terpene'; button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', id);
    const label = document.createElement('span'); label.textContent = 'テルペン'; const chevron = document.createElement('i'); chevron.setAttribute('aria-hidden', 'true'); chevron.textContent = '⌄'; button.append(label, chevron);
    const panel = document.createElement('section'); panel.id = id; panel.dataset.ucdPanel = 'terpene'; panel.dataset.profileKind = 'terpene'; panel.dataset.terpeneUnavailable = 'v1'; panel.hidden = true;
    const box = document.createElement('div'); box.className = 'ucd-terpene-unavailable'; const kicker = document.createElement('small'); kicker.textContent = 'TERPENE DATA / テルペン'; const heading = document.createElement('strong'); heading.textContent = reason.title; const text = document.createElement('p'); text.textContent = reason.text; box.append(kicker, heading, text); panel.append(box); nav.append(button); panels.append(panel); nav.dataset.count = String(nav.querySelectorAll('[data-ucd-tab]').length);
    button.addEventListener('click', event => { event.preventDefault(); const isOpen = button.getAttribute('aria-expanded') === 'true' && !panel.hidden; root.querySelectorAll('[data-ucd-tab]').forEach(item => { item.setAttribute('aria-expanded', 'false'); item.classList.remove('is-active'); }); root.querySelectorAll('[data-ucd-panel]').forEach(item => { item.hidden = true; }); if (!isOpen) { button.setAttribute('aria-expanded', 'true'); button.classList.add('is-active'); panel.hidden = false; } });
    return true;
  };
  const processed = new WeakSet();
  const govern = async () => {
    const root = shell.querySelector('.ucd-root[data-public-detail-id][data-universal-detail-version="UNIVERSAL_CULTIVAR_DETAIL_V1"]');
    if (!root || processed.has(root)) return;
    root.dataset.publicPresentationReady = 'false';
    const catalog = await loadCatalog(), cultivar = catalog?.cultivars?.find(item => item?.id === root.dataset.publicDetailId);
    if (!cultivar) throw new Error(`PUBLIC_CULTIVAR_MISSING:${root.dataset.publicDetailId}`);
    if (cultivar?.publicPresentation?.contractVersion !== CONTRACT) throw new Error(`PUBLIC_CONTRACT_MISSING:${root.dataset.publicDetailId}`);
    let expected = 0, decorated = 0;
    for (const [selector, details] of detailsFor(cultivar?.aromas?.presentation)) { const result = decorateGroup(root, selector, details); expected += result.expected; decorated += result.decorated; }
    if (expected !== decorated) throw new Error(`AROMA_PRESENTATION_INCOMPLETE:${decorated}/${expected}`);
    if (decorated) root.dataset.aromaTerminologyReady = 'true';
    const cannabinoidSummary = sourceDeclaredCannabinoidSummary(cultivar);
    const cannabinoidContext = decorateSourceDeclaredCannabinoids(root, cultivar);
    if (cannabinoidSummary && !root.querySelector('[data-cannabinoid-source-context="v1"]')) throw new Error(`CANNABINOID_CONTEXT_MISSING:${cultivar.id}`);
    const typeOnlySection = root.querySelector('.ucd-type-only');
    const ratioUnavailable = decorateUnavailableRatio(root, cultivar);
    if (typeOnlySection && !root.querySelector('[data-ratio-unavailable="v1"]')) throw new Error(`RATIO_UNAVAILABLE_CONTEXT_MISSING:${cultivar.id}`);
    const terpeneListedClarified = clarifyListedTerpenes(root, cultivar);
    const terpeneUnavailable = addUnavailableTerpene(root, cultivar);
    root.dataset.publicPresentationReady = 'true'; processed.add(root);
    window.__CSWPublicPresentationContractV1 = { status: 'PASS', contractVersion: CONTRACT, cultivarId: cultivar.id, aromaTerms: decorated, cannabinoidContext, ratioUnavailable, terpeneListedClarified, terpeneUnavailable };
  };
  const style = document.createElement('style'); style.id = 'public-presentation-contract-v1-style'; style.textContent = `
    #detail-shell:not(:has(.ucd-root[data-public-presentation-ready="true"])) > :not(.detail-topbar){visibility:hidden!important}
    .ucd-aroma-terms span[data-aroma-public-term="v1"]{align-items:flex-start;flex-direction:column;justify-content:center;line-height:1.35}
    .ucd-aroma-terms span[data-aroma-public-term="v1"] strong{color:inherit;font:inherit}
    .ucd-aroma-terms span[data-aroma-public-term="v1"] small{color:#93a098;font-size:9px;font-weight:650;letter-spacing:0}
    .ucd-lineage summary>.ucd-grade{display:inline-flex;flex:0 0 auto;width:auto;min-width:0;max-width:max-content;min-height:18px;padding:2px 5px;align-self:center;justify-self:end;white-space:nowrap;font-size:8px;font-weight:750;letter-spacing:.02em;opacity:.76}
    .ucd-ratio-unavailable{margin:9px auto 0;max-width:32rem;color:#93a098;font-size:10px;line-height:1.6;text-align:center}
    .ucd-cannabinoid-card[data-source-declared-cannabinoids="v1"] summary{display:grid}
    .ucd-cannabinoid-source-context{margin:10px 0 4px;padding:11px 12px;border:1px solid rgba(216,189,98,.24);border-radius:12px;background:rgba(216,189,98,.05)}
    .ucd-cannabinoid-source-context-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
    .ucd-cannabinoid-source-context strong{color:#d8bd62;font-size:10px;letter-spacing:.04em}
    .ucd-cannabinoid-source-context span{color:#eef3ef;font-size:14px;font-weight:800;white-space:nowrap}
    .ucd-cannabinoid-source-context p{margin:6px 0 0;color:#a5afa8;font-size:10px;line-height:1.6}
    .ucd-cannabinoid-card[data-source-declared-cannabinoids="v1"] .ucd-cannabinoid-grid[data-source-declared-individual-values="v1"]{display:none}
    .ucd-cannabinoid-card[data-source-declared-cannabinoids="v1"][open] .ucd-cannabinoid-grid[data-source-declared-individual-values="v1"]{display:grid;margin-top:14px}
    .ucd-cannabinoid-card[data-source-declared-cannabinoids="v1"] .ucd-cannabinoid-grid strong{font-size:clamp(20px,5vw,30px)}
    .ucd-cannabinoid-source-explanation{color:#a5afa8!important;font-size:10px!important;line-height:1.65!important}
    .ucd-terpene-unavailable{padding:18px 16px;border:1px solid rgba(216,189,98,.14);border-radius:14px;background:rgba(255,255,255,.018)}
    .ucd-terpene-unavailable>small{display:block;margin-bottom:8px;color:#d8bd62;font-size:9px;font-weight:900;letter-spacing:.1em}
    .ucd-terpene-unavailable>strong{display:block;margin-bottom:8px;color:#dfe7e1;font-size:13px}
    .ucd-terpene-unavailable>p{margin:0;color:#93a098;font-size:10px;line-height:1.75}
  `; document.head.appendChild(style);
  let scheduled = false;
  const schedule = () => { if (scheduled) return; scheduled = true; queueMicrotask(() => { scheduled = false; govern().catch(error => { window.__CSWPublicPresentationContractV1 = { status: 'FAIL_CLOSED', error: String(error?.message || error) }; console.error('PUBLIC_PRESENTATION_CONTRACT_V1', error); }); }); };
  new MutationObserver(schedule).observe(shell, { childList: true }); schedule();
})();
