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
      if (!detail?.rawMatch || !detail?.plainMeaningJa) throw new Error(`AROMA_PRESENTATION_TERM:${selector}:${index}`);
      term.replaceChildren();
      const englishLabel = String(detail.rawMatch).trim().replace(/\b[a-z]/g, char => char.toUpperCase());
      const review = document.createElement('strong'); review.textContent = englishLabel;
      const meaning = document.createElement('small'); meaning.textContent = detail.plainMeaningJa;
      term.append(review, meaning); term.dataset.aromaPublicTerm = 'v1';
    });
    return { expected: details.length, decorated: terms.length };
  };
  const sourceDeclaredCannabinoidSummary = cultivar => {
    const items = Array.isArray(cultivar?.cannabinoids?.presentation?.items) ? cultivar.cannabinoids.presentation.items : [];
    const hasNumericDeclarationValue = item => Number.isFinite(item?.value) || (Number.isFinite(item?.minValue) && Number.isFinite(item?.maxValue)) || (['maximum','less-than'].includes(item?.valueKind) && Number.isFinite(item?.boundaryValue));
    const declarationEntries = items.map((item, index) => ({ item, index })).filter(({ item }) => item?.evidenceType === 'SOURCE_DECLARED_NUMERIC' && item?.unit === '%' && hasNumericDeclarationValue(item));
    if (!declarationEntries.length) return null;
    const declarations = declarationEntries.map(entry => entry.item);
    const scopes = new Set(declarations.map(item => item.evidenceScopeRef).filter(Boolean));
    const sourceRefs = [...new Set(declarations.flatMap(item => Array.isArray(item.sourceRefs) ? item.sourceRefs : []).filter(Boolean))];
    const valueTexts = declarations.map(item => {
      if (typeof item.valueText === 'string' && item.valueText.trim()) return item.valueText.trim();
      if (Number.isFinite(item.minValue) && Number.isFinite(item.maxValue)) return `${item.minValue}〜${item.maxValue}%`;
      if (Number.isFinite(item.value)) return `${item.value}%`;
      return '';
    }).filter(Boolean);
    const sampleComparable = declarations.every(item => item.valueKind === 'exact' && Number.isFinite(item.value));
    const lows = declarations.filter(item => item.valueKind === 'exact' && Number.isFinite(item.value)).map(item => item.value);
    const highs = [...lows];
    return { declarationEntries, count: declarations.length, scopeCount: scopes.size || declarations.length, sourceRefs, valueTexts, min: lows.length ? Math.min(...lows) : null, max: highs.length ? Math.max(...highs) : null, sampleComparable, sampleScoped: declarations.every(item => item.evidenceScope === 'sample'), unverified: declarations.every(item => item.analysisVerified === false) };
  };
  const decorateSourceDeclaredCannabinoids = (root, cultivar, catalog) => {
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
    const count = document.createElement('span'); count.textContent = summary.sampleScoped ? (summary.sampleComparable ? (summary.min === summary.max ? `${summary.min}%` : `掲載値 ${summary.min}〜${summary.max}%`) : `${summary.count}件`) : `${summary.count}件`;
    top.append(label, count);
    const note = document.createElement('p');
    const verificationText = summary.unverified ? '元の分析書そのものはCSWで直接確認できていないため、分析確認済みの測定値としては扱っていません。' : '';
    const quotedValues = summary.valueTexts.length ? `「${summary.valueTexts.join('」「')}」` : `${summary.count}件`;
    const publishers = [...new Set(summary.sourceRefs.map(ref => catalog?.sources?.[ref]?.publisher).filter(Boolean))];
    const sourceLead = publishers.length ? `${publishers.join(' / ')}の採用資料には` : '採用した公式資料には';
    if (summary.sampleScoped) note.textContent = `公式掲載の検体データは${summary.scopeCount}検体・${summary.count}件です。個別検体や再検査を含む場合があるため、品種全体の固定値として統合していません。${verificationText}`;
    else if (summary.count > 1) note.textContent = `${sourceLead}${quotedValues}の${summary.count}件の掲載値があります。これらを1つの確定値へ統合していません。${verificationText}`;
    else note.textContent = `${sourceLead}${quotedValues}の掲載値があります。品種全体の固定値を示すものではありません。${verificationText}`;
    context.append(top, note);
    const grid = section.querySelector('.ucd-cannabinoid-grid');
    if (!grid) throw new Error(`CANNABINOID_GRID_MISSING:${cultivar.id}`);
    grid.dataset.sourceDeclaredIndividualValues = 'v1';
    for (const { item, index } of summary.declarationEntries) {
      const cell = grid.children[index];
      const small = cell?.querySelector('small');
      const sourceRef = Array.isArray(item.sourceRefs) ? item.sourceRefs.find(Boolean) : null;
      const source = sourceRef ? catalog?.sources?.[sourceRef] : null;
      if (small && source?.publisher) small.textContent = `${item.label || 'THC'} · ${source.publisher}`;
    }
    grid.insertAdjacentElement('beforebegin', context);
    const detail = section.querySelector('.ucd-spec-detail');
    if (detail) {
      [...detail.querySelectorAll(':scope > p')].forEach(paragraph => {
        const text = paragraph.textContent || '';
        if (text.includes('公式掲載値（分析未確認）') || text.includes('含有量は個体・栽培条件・分析ロット')) paragraph.remove();
      });
      const explanation = document.createElement('p');
      explanation.className = 'ucd-cannabinoid-source-explanation';
      explanation.textContent = summary.sampleScoped ? '上の値は公式掲載の個別検体データです。個別検体や再検査を含む場合があるため、品種全体の固定値として統合していません。' : summary.count > 1 ? '上の値は別々の公式掲載値です。出典ごとの差を保ったまま表示し、1つの確定値へ統合していません。' : '上の値は公式掲載値です。品種全体の固定値として確定した分析値ではありません。';
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
  const compactDetailNavigation = (root, cultivar) => {
    if (root.dataset.compactDetailNav === 'v1') return true;

    const specs = root.querySelector('.ucd-specs');
    const typeCard = specs?.querySelector(':scope > .ucd-type-only, :scope > .ucd-ratio-card');
    const cannabinoidCard = specs?.querySelector(':scope > .ucd-cannabinoid-card');
    if (specs && (typeCard || cannabinoidCard)) {
      const controls = document.createElement('section');
      controls.className = 'ucd-primary-controls';
      controls.dataset.compactPrimaryControls = 'v1';
      const nav = document.createElement('nav');
      nav.className = 'ucd-primary-nav';
      nav.setAttribute('aria-label', '基本情報');
      const panels = document.createElement('div');
      panels.className = 'ucd-primary-panels';

      const addPrimary = (kind, labelText, valueText, card) => {
        if (!card) return;
        const id = `ucd-${cultivar.id}-primary-${kind}`;
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.ucdPrimaryTab = kind;
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', id);
        const copy = document.createElement('span');
        copy.className = 'ucd-primary-nav-copy';
        const label = document.createElement('small');
        label.textContent = labelText;
        const value = document.createElement('strong');
        value.textContent = valueText || labelText;
        const chevron = document.createElement('i');
        chevron.setAttribute('aria-hidden', 'true');
        chevron.textContent = '⌄';
        copy.append(label, value);
        button.append(copy, chevron);

        const panel = document.createElement('section');
        panel.id = id;
        panel.className = 'ucd-primary-panel';
        panel.dataset.ucdPrimaryPanel = kind;
        panel.hidden = true;
        if (card.tagName === 'DETAILS') card.open = false;
        panel.append(card);
        nav.append(button);
        panels.append(panel);
      };

      const typeValue = typeCard?.querySelector('.ucd-ratio-head > b, :scope > strong')?.textContent?.trim() || '';
      const cannabinoidItems = Array.isArray(cultivar?.cannabinoids?.presentation?.items) ? cultivar.cannabinoids.presentation.items : [];
      const preferredCannabinoid = cannabinoidItems.find(item => item?.label === 'THC') || cannabinoidItems[0];
      const cannabinoidValue = preferredCannabinoid?.valueText
        ? `${preferredCannabinoid.label || ''} ${preferredCannabinoid.valueText}`.trim()
        : cannabinoidItems.length ? `${cannabinoidItems.length}件` : '';
      addPrimary('type', 'タイプ', typeValue, typeCard);
      addPrimary('cannabinoid', 'カンナビノイド', cannabinoidValue, cannabinoidCard);
      nav.dataset.count = String(nav.querySelectorAll('[data-ucd-primary-tab]').length);

      nav.addEventListener('click', event => {
        const button = event.target.closest('[data-ucd-primary-tab]');
        if (!button || !nav.contains(button)) return;
        event.preventDefault();
        const kind = button.dataset.ucdPrimaryTab;
        const panel = panels.querySelector(`[data-ucd-primary-panel="${CSS.escape(kind)}"]`);
        const wasOpen = button.getAttribute('aria-expanded') === 'true' && panel && !panel.hidden;
        nav.querySelectorAll('[data-ucd-primary-tab]').forEach(item => {
          item.setAttribute('aria-expanded', 'false');
          item.classList.remove('is-active');
        });
        panels.querySelectorAll('[data-ucd-primary-panel]').forEach(item => { item.hidden = true; });
        if (!wasOpen && panel) {
          button.setAttribute('aria-expanded', 'true');
          button.classList.add('is-active');
          panel.hidden = false;
          panel.querySelectorAll('details.ucd-spec-card').forEach(detail => { detail.open = true; });
        }
      });

      controls.append(nav, panels);
      specs.replaceWith(controls);
    }

    const profile = root.querySelector('.ucd-profile');
    const profileNav = profile?.querySelector('.ucd-profile-nav');
    const profilePanels = profile?.querySelector('.ucd-profile-panels');
    if (profileNav && profilePanels) {
      const originButton = profileNav.querySelector('[data-ucd-tab="origin"]');
      const historyButton = profileNav.querySelector('[data-ucd-tab="history"]');
      const originPanel = profilePanels.querySelector('[data-ucd-panel="origin"]');
      const historyPanel = profilePanels.querySelector('[data-ucd-panel="history"]');
      if (originButton || historyButton || originPanel || historyPanel) {
        const button = originButton || historyButton;
        const removeButton = button === originButton ? historyButton : originButton;
        const id = `ucd-${cultivar.id}-origin-history`;
        const combined = document.createElement('section');
        combined.id = id;
        combined.dataset.ucdPanel = 'origin-history';
        combined.dataset.profileKind = 'origin-history';
        combined.className = 'ucd-origin-history-panel';
        combined.hidden = true;
        const stack = document.createElement('div');
        stack.className = 'ucd-origin-history-stack';
        const appendSection = (headingText, sourcePanel) => {
          if (!sourcePanel) return;
          const section = document.createElement('section');
          section.className = 'ucd-origin-history-section';
          const heading = document.createElement('small');
          heading.className = 'ucd-origin-history-heading';
          heading.textContent = headingText;
          section.append(heading);
          while (sourcePanel.firstChild) section.append(sourcePanel.firstChild);
          stack.append(section);
        };
        appendSection('ORIGIN / 起源', originPanel);
        appendSection('HISTORY / 歴史', historyPanel);
        combined.append(stack);

        if (button) {
          button.dataset.ucdTab = 'origin-history';
          button.setAttribute('aria-controls', id);
          button.setAttribute('aria-expanded', 'false');
          button.classList.remove('is-active');
          const label = button.querySelector('span');
          if (label) label.textContent = '起源と歴史';
        }
        removeButton?.remove();
        originPanel?.remove();
        historyPanel?.remove();
        profilePanels.append(combined);
      }

      const order = ['aroma', 'terpene', 'origin-history', 'positioning'];
      for (const kind of order) {
        const button = profileNav.querySelector(`[data-ucd-tab="${kind}"]`);
        const panel = profilePanels.querySelector(`[data-ucd-panel="${kind}"]`);
        if (button) profileNav.append(button);
        if (panel) profilePanels.append(panel);
      }
      profileNav.dataset.count = String(profileNav.querySelectorAll('[data-ucd-tab]').length);
    }

    root.dataset.compactDetailNav = 'v1';
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
    const cannabinoidContext = decorateSourceDeclaredCannabinoids(root, cultivar, catalog);
    if (cannabinoidSummary && !root.querySelector('[data-cannabinoid-source-context="v1"]')) throw new Error(`CANNABINOID_CONTEXT_MISSING:${cultivar.id}`);
    const typeOnlySection = root.querySelector('.ucd-type-only');
    const ratioUnavailable = decorateUnavailableRatio(root, cultivar);
    if (typeOnlySection && !root.querySelector('[data-ratio-unavailable="v1"]')) throw new Error(`RATIO_UNAVAILABLE_CONTEXT_MISSING:${cultivar.id}`);
    const terpeneListedClarified = clarifyListedTerpenes(root, cultivar);
    const terpeneUnavailable = addUnavailableTerpene(root, cultivar);
    const compactNavigation = compactDetailNavigation(root, cultivar);
    if (!root.querySelector('[data-compact-primary-controls="v1"]') && root.querySelector('.ucd-specs')) throw new Error(`COMPACT_PRIMARY_NAV_MISSING:${cultivar.id}`);
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
    .ucd-data-unavailable>small{font-size:13px!important}
    .ucd-data-unavailable>strong{font-size:16px!important;line-height:1.45}
    .ucd-data-unavailable>p{font-size:15px!important;line-height:1.75}
  `; document.head.appendChild(style);
  let scheduled = false;
  const schedule = () => { if (scheduled) return; scheduled = true; queueMicrotask(() => { scheduled = false; govern().catch(error => { window.__CSWPublicPresentationContractV1 = { status: 'FAIL_CLOSED', error: String(error?.message || error) }; console.error('PUBLIC_PRESENTATION_CONTRACT_V1', error); }); }); };
  new MutationObserver(schedule).observe(shell, { childList: true }); schedule();
})();

;(()=>{"use strict";
const CONTRACT="UNIVERSAL_FLAVOR_PRESENTATION_V1";
const shell=document.getElementById("detail-shell");if(!shell)return;
const esc=x=>String(x??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
let catalogPromise=null;
const catalog=()=>catalogPromise||(catalogPromise=window.__CSWRuntimeCatalogPromise?Promise.resolve(window.__CSWRuntimeCatalogPromise):fetch(`runtime/catalog.json?flavor=${Date.now()}`,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(`runtime catalog HTTP ${r.status}`);return r.json()}));
function evidence(cat,claim){const ref=Array.isArray(claim?.sourceRefs)?claim.sourceRefs.find(Boolean):null,src=ref?cat?.sources?.[ref]:null,grade=["A","B","C"].includes(claim?.confidence)?`<span class="ucd-grade grade-${esc(claim.confidence.toLowerCase())}">根拠 ${esc(claim.confidence)}</span>`:"";return grade||src?.url?`<div class="ucd-evidence-row">${grade}${src?.url?`<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.publisher||src.title||"情報源")} <span aria-hidden="true">↗</span></a>`:""}</div>`:""}
function bind(root,button,panel){if(button.dataset.flavorBound===CONTRACT)return;button.dataset.flavorBound=CONTRACT;button.addEventListener("click",ev=>{ev.preventDefault();const wasOpen=button.getAttribute("aria-expanded")==="true"&&!panel.hidden;root.querySelectorAll("[data-ucd-tab]").forEach(b=>{b.setAttribute("aria-expanded","false");b.classList.remove("is-active")});root.querySelectorAll("[data-ucd-panel]").forEach(p=>p.hidden=true);if(!wasOpen){button.setAttribute("aria-expanded","true");button.classList.add("is-active");panel.hidden=false}})}
async function decorate(){const id=new URL(location.href).searchParams.get("strain");if(!id)return;const cat=await catalog(),cultivar=(cat?.cultivars||[]).find(x=>x?.id===id),claim=cultivar?.flavors;if(!cultivar||!["confirmed","disputed"].includes(claim?.status)||!Array.isArray(claim?.items)||!claim.items.length)return;const root=shell.querySelector(`.detail-public-v1[data-public-detail-id="${CSS.escape(id)}"]`),profile=root?.querySelector('.ucd-profile'),nav=profile?.querySelector('.ucd-profile-nav'),panels=profile?.querySelector('.ucd-profile-panels');if(!(root&&profile&&nav&&panels)){window.__CSWFlavorPresentationV1Error=`FLAVOR_CONTEXT_MISSING:${id}`;return}if(root.dataset.flavorPresentationReady==='v1'&&nav.querySelector('[data-ucd-tab="flavor"]')&&panels.querySelector('[data-ucd-panel="flavor"]'))return;let button=nav.querySelector('[data-ucd-tab="flavor"]'),panel=panels.querySelector('[data-ucd-panel="flavor"]');if(!button){button=document.createElement('button');button.type='button';button.dataset.ucdTab='flavor';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',`ucd-${id}-flavor`);button.innerHTML='<span>味わい</span><i aria-hidden="true">⌄</i>';nav.appendChild(button)}if(!panel){panel=document.createElement('section');panel.id=`ucd-${id}-flavor`;panel.dataset.ucdPanel='flavor';panel.dataset.profileKind='flavor';panel.hidden=true;panels.appendChild(panel)}const note=String(cultivar?.publicContent?.ja?.flavorNote||claim?.note||'').trim();panel.innerHTML=`<div class="ucd-flavor-profile" data-flavor-presentation="v1"><div class="ucd-sensory-head"><span>FLAVOR PROFILE / 味わい</span><small>情報源に記載された味の表現</small></div><div class="ucd-flavor-terms">${claim.items.map(x=>`<span>${esc(x)}</span>`).join('')}</div>${note?`<div class="ucd-note"><small>公式の味わい説明</small><p>${esc(note)}</p></div>`:''}${evidence(cat,claim)}</div>`;bind(root,button,panel);root.dataset.flavorPresentationReady='v1';nav.dataset.count=String(nav.querySelectorAll('[data-ucd-tab]').length)}
const style=document.createElement('style');style.id='universal-flavor-presentation-v1-style';style.textContent='.ucd-flavor-profile{display:grid;gap:12px}.ucd-flavor-terms{display:flex;flex-wrap:wrap;gap:8px}.ucd-flavor-terms span{display:inline-flex;align-items:center;min-height:34px;padding:7px 11px;border:1px solid rgba(216,189,98,.22);border-radius:999px;background:linear-gradient(135deg,rgba(216,189,98,.08),rgba(43,85,55,.07));color:#e5e7dc;font-size:11px;font-weight:780}.ucd-flavor-profile .ucd-note{margin-top:1px}@media(max-width:390px){.ucd-flavor-terms{gap:6px}.ucd-flavor-terms span{min-height:32px;padding:6px 9px;font-size:10px}}';document.head.appendChild(style);
new MutationObserver(()=>queueMicrotask(()=>decorate().catch(e=>{window.__CSWFlavorPresentationV1Error=String(e?.message||e)}))).observe(shell,{childList:true,subtree:true});shell.addEventListener('click',()=>queueMicrotask(()=>decorate().catch(()=>{})),true);window.addEventListener('popstate',()=>queueMicrotask(()=>decorate().catch(()=>{})));queueMicrotask(()=>decorate().catch(e=>{window.__CSWFlavorPresentationV1Error=String(e?.message||e)}));
})();
;(()=>{"use strict";
const CONTRACT="UNIVERSAL_MORPHOLOGY_PRESENTATION_V1";
const shell=document.getElementById("detail-shell");if(!shell)return;
const esc=x=>String(x??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
let catalogPromise=null;
const catalog=()=>catalogPromise||(catalogPromise=window.__CSWRuntimeCatalogPromise?Promise.resolve(window.__CSWRuntimeCatalogPromise):fetch(`runtime/catalog.json?morphology=${Date.now()}`,{cache:"no-store"}).then(r=>{if(!r.ok)throw new Error(`runtime catalog HTTP ${r.status}`);return r.json()}));
function evidence(cat,claim){const ref=Array.isArray(claim?.sourceRefs)?claim.sourceRefs.find(Boolean):null,src=ref?cat?.sources?.[ref]:null,grade=["A","B","C"].includes(claim?.confidence)?`<span class="ucd-grade grade-${esc(claim.confidence.toLowerCase())}">根拠 ${esc(claim.confidence)}</span>`:"";return grade||src?.url?`<div class="ucd-evidence-row">${grade}${src?.url?`<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.publisher||src.title||"情報源")} <span aria-hidden="true">↗</span></a>`:""}</div>`:""}
function bind(root,button,panel){if(button.dataset.morphologyBound===CONTRACT)return;button.dataset.morphologyBound=CONTRACT;button.addEventListener("click",ev=>{ev.preventDefault();const wasOpen=button.getAttribute("aria-expanded")==="true"&&!panel.hidden;root.querySelectorAll("[data-ucd-tab]").forEach(b=>{b.setAttribute("aria-expanded","false");b.classList.remove("is-active")});root.querySelectorAll("[data-ucd-panel]").forEach(p=>p.hidden=true);if(!wasOpen){button.setAttribute("aria-expanded","true");button.classList.add("is-active");panel.hidden=false}})}
async function decorate(){const id=new URL(location.href).searchParams.get("strain");if(!id)return;const cat=await catalog(),cultivar=(cat?.cultivars||[]).find(x=>x?.id===id),claim=cultivar?.morphology,presentation=claim?.presentation,text=String(presentation?.textJa||"").trim();if(!cultivar||claim?.status!=="confirmed"||presentation?.mode!=="summary"||!text)return;const root=shell.querySelector(`.detail-public-v1[data-public-detail-id="${CSS.escape(id)}"],.ucd-root[data-public-detail-id="${CSS.escape(id)}"]`),profile=root?.querySelector('.ucd-profile'),nav=profile?.querySelector('.ucd-profile-nav'),panels=profile?.querySelector('.ucd-profile-panels');if(!(root&&profile&&nav&&panels)){window.__CSWMorphologyPresentationV1={status:'FAIL_CLOSED',error:`MORPHOLOGY_CONTEXT_MISSING:${id}`};return}if(root.dataset.morphologyPresentationReady==='v1'&&nav.querySelector('[data-ucd-tab="morphology"]')&&panels.querySelector('[data-ucd-panel="morphology"]'))return;let button=nav.querySelector('[data-ucd-tab="morphology"]'),panel=panels.querySelector('[data-ucd-panel="morphology"]');if(!button){button=document.createElement('button');button.type='button';button.dataset.ucdTab='morphology';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',`ucd-${id}-morphology`);button.innerHTML='<span>形態</span><i aria-hidden="true">⌄</i>';const before=nav.querySelector('[data-ucd-tab="origin-history"]');before?nav.insertBefore(button,before):nav.appendChild(button)}if(!panel){panel=document.createElement('section');panel.id=`ucd-${id}-morphology`;panel.dataset.ucdPanel='morphology';panel.dataset.profileKind='morphology';panel.hidden=true;const before=panels.querySelector('[data-ucd-panel="origin-history"]');before?panels.insertBefore(panel,before):panels.appendChild(panel)}panel.innerHTML=`<div class="ucd-morphology-profile" data-morphology-presentation="v1"><div class="ucd-sensory-head"><span>MORPHOLOGY / 形態</span><small>情報源で確認できる株・花の形態</small></div><div class="ucd-morphology-summary"><p>${esc(text)}</p></div>${evidence(cat,claim)}</div>`;bind(root,button,panel);root.dataset.morphologyPresentationReady='v1';nav.dataset.count=String(nav.querySelectorAll('[data-ucd-tab]').length);window.__CSWMorphologyPresentationV1={status:'PASS',contractVersion:CONTRACT,cultivarId:id}}
const style=document.createElement('style');style.id='universal-morphology-presentation-v1-style';style.textContent='.ucd-morphology-profile{display:grid;gap:12px}.ucd-morphology-summary{padding:14px 15px;border:1px solid rgba(216,189,98,.16);border-radius:14px;background:rgba(255,255,255,.018)}.ucd-morphology-summary p{margin:0;color:#dfe7e1;font-size:11px;line-height:1.8}';document.head.appendChild(style);
let scheduled=false;const schedule=()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;decorate().catch(error=>{window.__CSWMorphologyPresentationV1={status:'FAIL_CLOSED',error:String(error?.message||error)};console.error(CONTRACT,error)})})};new MutationObserver(schedule).observe(shell,{childList:true,subtree:true});schedule();
})();


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
    let profile=root.querySelector('.ucd-profile');
    if(!profile){
      profile=document.createElement('section');profile.className='ucd-profile';profile.dataset.fixedProfileShell='v1';
      const createdNav=document.createElement('nav');createdNav.className='ucd-profile-nav';createdNav.setAttribute('aria-label','詳細情報');
      const createdPanels=document.createElement('div');createdPanels.className='ucd-profile-panels';
      profile.append(createdNav,createdPanels);
      const controls=root.querySelector('.ucd-primary-controls');
      controls?controls.insertAdjacentElement('afterend',profile):root.append(profile);
    }
    const nav=profile.querySelector('.ucd-profile-nav'),panels=profile.querySelector('.ucd-profile-panels');
    if(!(nav&&panels))return false;
    for(const kind of Object.keys(specs))ensure(root,nav,panels,kind);
    reorder(nav,panels);nav.dataset.count=String(nav.querySelectorAll('[data-ucd-tab]').length);root.dataset.fixedDetailCardsV1='true';return true;
  }
  let queued=false;const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>requestAnimationFrame(()=>{queued=false;decorate()}));};
  new MutationObserver(schedule).observe(shell,{childList:true,subtree:true});shell.addEventListener('click',schedule,true);window.addEventListener('popstate',schedule);schedule();setTimeout(schedule,250);setTimeout(schedule,1000);
})();


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

(() => {
  'use strict';
  const MARK = 'CSW_STAGED_EFFECT_CULTIVATION_V1';
  const TARGETS = new Set(['fat-banana-auto','blue-gelato-41','sour-diesel','mimosa','apple-fritter','mac-1']);
  const shell = document.getElementById('detail-shell');
  if (!shell) return;

  const style = document.createElement('style');
  style.id = 'csw-staged-effect-cultivation-v1-style';
  style.textContent = `
    .detail-public-v1[data-csw-staged-effect-cultivation="v1"] .csw-staged-ec-subnav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:4px 0 10px}
    .detail-public-v1[data-csw-staged-effect-cultivation="v1"] .csw-staged-ec-subnav button{appearance:none;min-width:0;min-height:38px;padding:8px 6px;border:1px solid rgba(216,189,98,.18);border-radius:11px;background:rgba(255,255,255,.025);color:#aebbb3;font:800 11px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer}
    .detail-public-v1[data-csw-staged-effect-cultivation="v1"] .csw-staged-ec-subnav button.is-active{border-color:rgba(216,189,98,.62);background:linear-gradient(135deg,rgba(216,189,98,.17),rgba(50,99,67,.12));color:#f1e2a9}
    .detail-public-v1[data-csw-staged-effect-cultivation="v1"] .csw-staged-effect-terms{display:flex;flex-wrap:wrap;gap:8px}
    .detail-public-v1[data-csw-staged-effect-cultivation="v1"] .csw-staged-effect-terms span{display:inline-flex;align-items:center;min-height:34px;padding:7px 11px;border:1px solid rgba(216,189,98,.22);border-radius:999px;background:rgba(216,189,98,.055);color:#e8eee9;font-size:11px;font-weight:780}
    .detail-public-v1[data-csw-staged-effect-cultivation="v1"] .csw-staged-effect-terms span[data-effect-public-term="v1"]{align-items:flex-start;flex-direction:column;justify-content:center;min-width:118px;min-height:52px;padding:8px 11px;border-radius:13px;line-height:1.25}
    .detail-public-v1[data-csw-staged-effect-cultivation="v1"] .csw-staged-effect-terms span[data-effect-public-term="v1"] strong{color:#eef3ef;font-size:14px;font-weight:820}
    .detail-public-v1[data-csw-staged-effect-cultivation="v1"] .csw-staged-effect-terms span[data-effect-public-term="v1"] small{margin-top:3px;color:#98a59d;font-size:11px;font-weight:650;letter-spacing:0}
    .detail-public-v1[data-csw-staged-effect-cultivation="v1"] .csw-staged-cultivation-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .detail-public-v1[data-csw-staged-effect-cultivation="v1"] .csw-staged-cultivation-row{min-width:0;padding:11px 12px;border:1px solid rgba(216,189,98,.14);border-radius:12px;background:rgba(255,255,255,.018)}
    .detail-public-v1[data-csw-staged-effect-cultivation="v1"] .csw-staged-cultivation-row small{display:block;margin-bottom:5px;color:#8e9b93;font-size:9px;font-weight:800;letter-spacing:.03em}
    .detail-public-v1[data-csw-staged-effect-cultivation="v1"] .csw-staged-cultivation-row strong{display:block;overflow-wrap:anywhere;color:#e6ece8;font-size:12px;line-height:1.45}
    @media(max-width:420px){.detail-public-v1[data-csw-staged-effect-cultivation="v1"] .csw-staged-cultivation-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  let catalogPromise;
  const loadCatalog = () => catalogPromise ||= (window.__CSWRuntimeCatalogPromise
    ? Promise.resolve(window.__CSWRuntimeCatalogPromise)
    : fetch('runtime/catalog.json', { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`catalog HTTP ${response.status}`);
        return response.json();
      }));

  const labels = {
    'yield:indoor': '収量・屋内',
    'yield:outdoor': '収量・屋外',
    'height:indoor': '高さ・屋内',
    'height:outdoor': '高さ・屋外',
    'floweringTime:unspecified': '開花期間',
    'harvestFromGermination:unspecified': '発芽から収穫',
    'harvestWindow:outdoor': '収穫時期',
    'climate:unspecified': '気候',
    'vegetativeStage:unspecified': '栄養成長期'
  };

  const addEvidence = (box, catalog, claim) => {
    const row = document.createElement('div');
    row.className = 'ucd-evidence-row';
    if (['A','B','C'].includes(claim?.confidence)) {
      const grade = document.createElement('span');
      grade.className = `ucd-grade grade-${claim.confidence.toLowerCase()}`;
      grade.textContent = `根拠 ${claim.confidence}`;
      row.appendChild(grade);
    }
    const ref = Array.isArray(claim?.sourceRefs) ? claim.sourceRefs.find(Boolean) : null;
    const source = ref ? catalog?.sources?.[ref] : null;
    if (source?.url) {
      const link = document.createElement('a');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = `${source.publisher || source.title || '情報源'} ↗`;
      row.appendChild(link);
    }
    if (row.childNodes.length) box.appendChild(row);
  };

  const MIMOSA_EFFECT_PUBLIC_TERMINOLOGY_V1 = new Map([
    ['creative',{ meaningJa:'創造的な感覚' }],
    ['laughter',{ meaningJa:'笑いを誘う感覚' }],
  ]);

  const buildEffect = (catalog, claim, cultivarId) => {
    const section = document.createElement('section');
    section.dataset.cswStagedEcSection = 'effects';
    section.hidden = true;
    const head = document.createElement('div');
    head.className = 'ucd-sensory-head';
    const title = document.createElement('span');
    title.textContent = 'EFFECT / 効果・体感';
    const small = document.createElement('small');
    small.textContent = '公式資料に記載されたEffect';
    head.append(title, small);
    const terms = document.createElement('div');
    terms.className = 'csw-staged-effect-terms';
    for (const item of claim.items || []) {
      const chip = document.createElement('span');
      const raw = String(item ?? '').trim();
      const presentation = cultivarId === 'mimosa' ? MIMOSA_EFFECT_PUBLIC_TERMINOLOGY_V1.get(raw.toLowerCase()) : null;
      if (presentation) {
        chip.dataset.effectPublicRaw = raw;
        chip.dataset.effectPublicTerm = 'v1';
        const original = document.createElement('strong');
        original.textContent = raw;
        const meaning = document.createElement('small');
        meaning.textContent = presentation.meaningJa;
        chip.append(original, meaning);
      } else {
        chip.textContent = raw;
      }
      terms.appendChild(chip);
    }
    section.append(head, terms);
    addEvidence(section, catalog, claim);
    return section;
  };

  const buildCultivation = (catalog, claim) => {
    const section = document.createElement('section');
    section.dataset.cswStagedEcSection = 'cultivation';
    section.hidden = true;
    const head = document.createElement('div');
    head.className = 'ucd-sensory-head';
    const title = document.createElement('span');
    title.textContent = 'CULTIVATION / 栽培情報';
    const small = document.createElement('small');
    small.textContent = '公式資料に記載された値';
    head.append(title, small);
    const grid = document.createElement('div');
    grid.className = 'csw-staged-cultivation-grid';
    for (const observation of claim.observations || []) {
      const row = document.createElement('div');
      row.className = 'csw-staged-cultivation-row';
      const label = document.createElement('small');
      label.textContent = labels[`${observation.field}:${observation.environment}`] || observation.field;
      const value = document.createElement('strong');
      value.className = 'csw-staged-cultivation-value';
      value.textContent = observation.displayText || '';
      row.append(label, value);
      grid.appendChild(row);
    }
    section.append(head, grid);
    addEvidence(section, catalog, claim);
    return section;
  };

  const unavailable = {
    effects: {
      kicker: 'EFFECT / 効果・体感',
      title: '効果・体感情報は確認できていません',
      text: '現在の採用資料では、この品種に直接結びつく効果・体感情報を十分に確認できていません。一般的な傾向や近縁品種から推測して補うことはしていません。',
    },
    cultivation: {
      kicker: 'CULTIVATION / 栽培情報',
      title: '栽培情報は確認できていません',
      text: '現在の採用資料では、この品種に直接結びつく栽培情報を十分に確認できていません。一般的な傾向や近縁品種から推測して補うことはしていません。',
    },
  };

  const buildUnavailable = kind => {
    const spec = unavailable[kind];
    const section = document.createElement('section');
    section.dataset.cswStagedEcSection = kind;
    section.dataset.cswStagedEcUnknown = kind;
    section.dataset.unavailableDetailCard = 'v1';
    section.hidden = true;
    const box = document.createElement('div');
    box.className = 'ucd-terpene-unavailable ucd-data-unavailable';
    const kicker = document.createElement('small');
    kicker.textContent = spec.kicker;
    const title = document.createElement('strong');
    title.textContent = spec.title;
    const text = document.createElement('p');
    text.textContent = spec.text;
    box.append(kicker, title, text);
    section.appendChild(box);
    return section;
  };

  const decorate = async () => {
    const target = new URL(location.href).searchParams.get('strain');
    if (!TARGETS.has(target)) return;
    const root = shell.querySelector(`.detail-public-v1[data-public-detail-id="${target}"]`);
    const profile = root?.querySelector('.ucd-profile');
    const nav = profile?.querySelector('.ucd-profile-nav');
    const panels = profile?.querySelector('.ucd-profile-panels');
    if (!(root && profile && nav && panels)) return;
    if (root.dataset.cswStagedEffectCultivation === 'v1') return;

    const catalog = await loadCatalog();
    const cultivar = (catalog?.cultivars || []).find(item => item?.id === target);
    const effects = cultivar?.effects;
    const cultivation = cultivar?.cultivation;
    const hasEffects = effects && ['confirmed','disputed'].includes(effects.status) && Array.isArray(effects.items) && effects.items.length;
    const hasCultivation = cultivation && ['confirmed','disputed'].includes(cultivation.status) && Array.isArray(cultivation.observations) && cultivation.observations.length;

    root.dataset.cswStagedEffectCultivation = 'v1';
    const panelId = `ucd-${target}-effect-cultivation`;
    const parent = document.createElement('button');
    parent.type = 'button';
    parent.dataset.ucdTab = 'effect-cultivation';
    parent.dataset.cswStagedEcParent = 'v1';
    parent.setAttribute('aria-expanded', 'false');
    parent.setAttribute('aria-controls', panelId);
    parent.innerHTML = '<span>効果・栽培</span><i aria-hidden="true">⌄</i>';
    const beforeButton = nav.querySelector('[data-ucd-tab="morphology"],[data-ucd-tab="origin-history"]');
    beforeButton ? nav.insertBefore(parent, beforeButton) : nav.appendChild(parent);

    const group = document.createElement('section');
    group.id = panelId;
    group.dataset.ucdPanel = 'effect-cultivation';
    group.dataset.cswStagedEcGroup = 'v1';
    group.hidden = true;
    const subnav = document.createElement('div');
    subnav.className = 'csw-staged-ec-subnav';
    subnav.setAttribute('aria-label', '効果・栽培');
    for (const [kind, label] of [['effects','効果'],['cultivation','栽培情報']]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.cswStagedEcSub = kind;
      button.textContent = label;
      button.setAttribute('aria-pressed', 'false');
      subnav.appendChild(button);
    }
    group.appendChild(subnav);
    group.appendChild(hasEffects ? buildEffect(catalog, effects, target) : buildUnavailable('effects'));
    group.appendChild(hasCultivation ? buildCultivation(catalog, cultivation) : buildUnavailable('cultivation'));
    const beforePanel = panels.querySelector('[data-ucd-panel="morphology"],[data-ucd-panel="origin-history"]');
    beforePanel ? panels.insertBefore(group, beforePanel) : panels.appendChild(group);

    parent.addEventListener('click', event => {
      event.preventDefault();
      const opening = parent.getAttribute('aria-expanded') !== 'true' || group.hidden;
      root.querySelectorAll('[data-ucd-tab]').forEach(button => { button.setAttribute('aria-expanded', 'false'); button.classList.remove('is-active'); });
      root.querySelectorAll('[data-ucd-panel]').forEach(panel => { panel.hidden = true; });
      group.querySelectorAll('[data-csw-staged-ec-sub]').forEach(button => { button.classList.remove('is-active'); button.setAttribute('aria-pressed', 'false'); });
      group.querySelectorAll('[data-csw-staged-ec-section]').forEach(section => { section.hidden = true; });
      if (opening) {
        parent.setAttribute('aria-expanded', 'true');
        parent.classList.add('is-active');
        group.hidden = false;
      }
    });

    group.querySelectorAll('[data-csw-staged-ec-sub]').forEach(button => {
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const kind = button.dataset.cswStagedEcSub;
        root.querySelectorAll('[data-ucd-panel]').forEach(panel => { panel.hidden = true; });
        group.hidden = false;
        group.querySelectorAll('[data-csw-staged-ec-section]').forEach(section => { section.hidden = section.dataset.cswStagedEcSection !== kind; });
        group.querySelectorAll('[data-csw-staged-ec-sub]').forEach(item => {
          const active = item === button;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        parent.setAttribute('aria-expanded', 'true');
        parent.classList.add('is-active');
      });
    });

    const visibleTop = [...nav.querySelectorAll(':scope > [data-ucd-tab]')].filter(button => button.dataset.cswStagedSensorySource !== 'v1');
    nav.dataset.count = String(visibleTop.length);
    window.__CSWStagedEffectCultivationV1 = { marker: MARK, status: 'READY', cultivarId: target };
  };

  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      decorate().catch(error => { window.__CSWStagedEffectCultivationV1 = { marker: MARK, status: 'FAIL_CLOSED', error: String(error?.message || error) }; });
    });
  };
  new MutationObserver(queue).observe(shell, { childList: true, subtree: true });
  shell.addEventListener('click', queue, true);
  window.addEventListener('popstate', queue);
  queue();
})();


;(()=>{
  'use strict';
  const CONTRACT='MIMOSA_FLAVOR_BILINGUAL_V1';
  const shell=document.getElementById('detail-shell');
  if(!shell)return;
  const terms=new Map([['earthy','土を思わせる風味'],['sour','酸味を思わせる風味']]);
  const chooseFlavorPanel=root=>{
    const list=[...root.querySelectorAll('[data-profile-kind="flavor"], [data-ucd-panel="flavor"]')];
    return list.find(panel=>panel.querySelector('[data-flavor-presentation="v1"]')) || list.find(panel=>panel.querySelector('.ucd-flavor-profile')) || list[0] || null;
  };
  const decorate=()=>{
    const id=new URL(location.href).searchParams.get('strain');
    if(id!=='mimosa')return false;
    const root=shell.querySelector('.detail-public-v1[data-public-detail-id="mimosa"]');
    if(!root)return false;
    const panel=chooseFlavorPanel(root);
    const nodes=panel?[...panel.querySelectorAll('.ucd-flavor-terms span')]:[];
    if(!nodes.length)return false;
    let decorated=0;
    for(const node of nodes){
      if(node.dataset.flavorPublicTerm==='v1'){decorated++;continue;}
      const raw=(node.textContent||'').trim();
      const meaning=terms.get(raw.toLowerCase());
      if(!meaning)continue;
      node.replaceChildren();
      node.dataset.flavorPublicRaw=raw;
      node.dataset.flavorPublicTerm='v1';
      const original=document.createElement('strong');original.textContent=raw;
      const small=document.createElement('small');small.textContent=meaning;
      node.append(original,small);decorated++;
    }
    if(decorated===2)root.dataset.mimosaFlavorBilingual=CONTRACT;
    return decorated===2;
  };
  let queued=false;const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>requestAnimationFrame(()=>{queued=false;decorate()}));};
  new MutationObserver(schedule).observe(shell,{childList:true,subtree:true});
  shell.addEventListener('click',schedule,true);window.addEventListener('popstate',schedule);
  schedule();setTimeout(schedule,250);setTimeout(schedule,1000);
})();


;(()=>{
  'use strict';
  const CONTRACT='APPLE_FRITTER_FLAVOR_BILINGUAL_V1',shell=document.getElementById('detail-shell');if(!shell)return;
  const terms=new Map([['sweet baked apple','焼いたリンゴのような甘い風味'],['creamy vanilla','クリーミーなバニラを思わせる風味'],['warm cinnamon','温かみのあるシナモンを思わせる風味'],['earthy','土を思わせる風味'],['diesel','ディーゼル燃料を思わせる風味']]);
  const chooseFlavorPanel=root=>{const list=[...root.querySelectorAll('[data-profile-kind="flavor"], [data-ucd-panel="flavor"]')];return list.find(panel=>panel.querySelector('[data-flavor-presentation="v1"]'))||list.find(panel=>panel.querySelector('.ucd-flavor-profile'))||list[0]||null};
  const decorate=()=>{const id=new URL(location.href).searchParams.get('strain');if(id!=='apple-fritter')return false;const root=shell.querySelector('.detail-public-v1[data-public-detail-id="apple-fritter"]');if(!root)return false;const panel=chooseFlavorPanel(root),nodes=panel?[...panel.querySelectorAll('.ucd-flavor-terms span')]:[];if(nodes.length!==terms.size)return false;let decorated=0;for(const node of nodes){if(node.dataset.flavorPublicTerm==='v1'){decorated++;continue}const raw=(node.textContent||'').trim(),meaning=terms.get(raw.toLowerCase());if(!meaning)continue;node.replaceChildren();node.dataset.flavorPublicRaw=raw;node.dataset.flavorPublicTerm='v1';const original=document.createElement('strong');original.textContent=raw.replace(/\b[a-z]/g,char=>char.toUpperCase());const small=document.createElement('small');small.textContent=meaning;node.append(original,small);decorated++}if(decorated===terms.size)root.dataset.appleFritterFlavorBilingual=CONTRACT;return decorated===terms.size};
  let queued=false;const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>requestAnimationFrame(()=>{queued=false;decorate()}))};new MutationObserver(schedule).observe(shell,{childList:true,subtree:true});shell.addEventListener('click',schedule,true);window.addEventListener('popstate',schedule);schedule();setTimeout(schedule,250);setTimeout(schedule,1000);
})();
