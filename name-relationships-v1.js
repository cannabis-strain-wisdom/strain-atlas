(() => {
  'use strict';

  const RAINBOW_ID = 'rainbow-belts';
  const RAINBOW_CONTRACT = 'RAINBOW_BELTS_NAME_RELATIONSHIP_RAIL_V1';
  const RAINBOW_PRESENTATION = 'RAINBOW_BELTS_LINEAGE_RELATIONSHIPS_INTEGRATED_V2';
  const SITEWIDE_CONTRACT = 'CSW_SITEWIDE_LINEAGE_RELATIONSHIPS_V1';
  const INTEGRATED_TITLE = '系譜・系統関係 / LINEAGE & RELATIONSHIPS';
  const RAINBOW_DERIVED = [
    { sourceId: 'archive-rainbow-belts-2-0', name: 'Rainbow Belts 2.0', lineage: 'Rainbow Belts #20 × Rainbow Belts F1' },
    { sourceId: 'archive-rainbow-belts-3-0', name: 'Rainbow Belts 3.0', lineage: 'Rainbow Belts #20 × Moonbow #112 F2 #60' }
  ];

  const shell = document.getElementById('detail-shell');
  if (!shell) return;

  const text = value => typeof value === 'string' ? value.trim() : '';
  const currentId = () => new URL(location.href).searchParams.get('strain');
  const unique = values => [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];

  let catalogPromise;
  const loadCatalog = () => {
    if (window.__CSWRuntimeCatalogPromise && typeof window.__CSWRuntimeCatalogPromise.then === 'function') {
      return Promise.resolve(window.__CSWRuntimeCatalogPromise);
    }
    catalogPromise ||= fetch('runtime/catalog.json', { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error(`catalog HTTP ${response.status}`);
      return response.json();
    });
    return catalogPromise;
  };

  const makeTrack = ({ node = false, last = false } = {}) => {
    const track = document.createElement('span');
    track.className = 'csw-name-rel-track';
    if (last) track.classList.add('is-last');
    track.setAttribute('aria-hidden', 'true');
    if (node) {
      const marker = document.createElement('span');
      marker.className = 'csw-name-rel-node';
      track.appendChild(marker);
    }
    return track;
  };

  const makeRelationshipLabel = (ja, en) => {
    const label = document.createElement('span');
    label.className = 'csw-name-rel-label is-derived';
    const jaNode = document.createElement('span');
    jaNode.textContent = ja;
    const enNode = document.createElement('small');
    enNode.textContent = en;
    label.append(jaNode, enNode);
    return label;
  };

  const makeDerivedBlock = line => {
    const block = document.createElement('div');
    block.className = 'csw-name-rel-name-block';
    const title = document.createElement('strong');
    title.className = 'csw-name-rel-name';
    title.textContent = line.name;
    const formula = document.createElement('p');
    formula.className = 'csw-name-rel-lineage';
    formula.textContent = line.lineage;
    const relation = document.createElement('div');
    relation.className = 'csw-name-rel-relation';
    relation.appendChild(makeRelationshipLabel('別系統', 'DERIVED LINE'));
    block.append(title, formula, relation);
    return block;
  };

  const makeAliasRow = (aliases, { standalone = false } = {}) => {
    if (!aliases.length) return null;
    const row = document.createElement('div');
    row.className = 'csw-name-rel-alias-row';
    if (standalone) row.classList.add('is-standalone');
    row.appendChild(makeTrack());

    const content = document.createElement('div');
    content.className = 'csw-name-rel-alias-block';
    const label = document.createElement('div');
    label.className = 'csw-name-rel-section-label';
    const ja = document.createElement('strong');
    ja.textContent = '別名・表記違い';
    const en = document.createElement('small');
    en.textContent = 'ALIAS';
    label.append(ja, en);

    const chips = document.createElement('div');
    chips.className = 'csw-name-rel-chips';
    aliases.forEach(alias => {
      const chip = document.createElement('span');
      chip.className = 'csw-name-rel-chip';
      chip.textContent = alias;
      chips.appendChild(chip);
    });
    content.append(label, chips);
    row.appendChild(content);
    return row;
  };

  const assertRainbowBoundarySources = catalog => {
    for (const line of RAINBOW_DERIVED) {
      const source = catalog?.sources?.[line.sourceId];
      if (!source || source.sourceType !== 'breederOfficial' || text(source.publisher) !== 'Archive Seed Bank' || text(source.title) !== line.name) {
        throw new Error(`RAINBOW_BELTS_DERIVED_SOURCE_MISMATCH:${line.sourceId}`);
      }
    }
  };

  const resolveCurrent = async () => {
    const id = currentId();
    if (!id) return null;
    const catalog = await loadCatalog();
    const cultivar = (catalog?.cultivars || []).find(item => item?.id === id);
    const root = shell.querySelector(`.detail-public-v1[data-public-detail-id="${id}"],.ucd-root[data-public-detail-id="${id}"]`);
    const lineageCard = root?.querySelector('.ucd-lineage') || shell.querySelector('.ucd-lineage');
    if (!cultivar || !root || !lineageCard) return null;
    return { id, catalog, cultivar, root, lineageCard };
  };

  const setIntegratedTitle = lineageCard => {
    const kicker = lineageCard.querySelector(':scope > summary > span > small');
    if (!kicker) throw new Error('LINEAGE_SUMMARY_KICKER_MISSING');
    if (kicker.textContent !== INTEGRATED_TITLE) kicker.textContent = INTEGRATED_TITLE;
  };

  const moveEvidenceFooterLast = lineageCard => {
    const body = lineageCard.querySelector(':scope > div');
    if (!body) return false;
    const evidence = body.querySelector(':scope > .ucd-evidence-row') || lineageCard.querySelector('.ucd-evidence-row');
    if (evidence && body.lastElementChild !== evidence) body.appendChild(evidence);
    return Boolean(evidence);
  };

  const decorateRainbow = ({ catalog, cultivar, root, lineageCard }) => {
    if (text(cultivar.name) !== 'Rainbow Belts') throw new Error('RAINBOW_BELTS_CANONICAL_NAME_MISMATCH');
    const rootLineage = text(cultivar?.lineage?.display);
    if (!rootLineage) throw new Error('RAINBOW_BELTS_ROOT_LINEAGE_MISSING');
    assertRainbowBoundarySources(catalog);
    setIntegratedTitle(lineageCard);

    let body = lineageCard.querySelector(':scope > div');
    if (!body) {
      body = document.createElement('div');
      lineageCard.appendChild(body);
    }
    if (lineageCard.dataset.lineageRelationships === 'v2' && body.querySelector('[data-name-relationships-integrated="v2"]')) {
      moveEvidenceFooterLast(lineageCard);
      return true;
    }

    const legacy = root.querySelector('[data-identity-family-pilot="v1"]');
    if (legacy) {
      legacy.hidden = true;
      legacy.setAttribute('aria-hidden', 'true');
      legacy.dataset.replacedByNameRelationships = 'v2';
    }
    root.querySelector('[data-name-relationships="v1"]')?.remove();
    body.querySelector('[data-sitewide-lineage-integrated="v1"]')?.remove();

    const evidenceRow = body.querySelector(':scope > .ucd-evidence-row') || lineageCard.querySelector('.ucd-evidence-row');
    const aliases = unique(cultivar.aliases).filter(alias => alias !== cultivar.name && !/\b(?:2\.0|3\.0|auto)\b/i.test(alias));
    const integrated = document.createElement('section');
    integrated.className = 'csw-name-rel-integrated';
    integrated.dataset.nameRelationshipsIntegrated = 'v2';

    const aliasRow = makeAliasRow(aliases);
    if (aliasRow) integrated.appendChild(aliasRow);
    RAINBOW_DERIVED.forEach((line, index) => {
      const row = document.createElement('div');
      row.className = 'csw-name-rel-rail-item';
      row.append(makeTrack({ node: true, last: index === RAINBOW_DERIVED.length - 1 }), makeDerivedBlock(line));
      integrated.appendChild(row);
    });

    body.appendChild(integrated);
    if (evidenceRow) body.appendChild(evidenceRow);
    lineageCard.dataset.lineageRelationships = 'v2';
    lineageCard.dataset.sitewideLineage = 'v1';
    root.dataset.nameRelationships = 'v2';
    root.dataset.sitewideLineageRelationships = 'v1';

    window.__CSWRainbowBeltsNameRelationshipRailV1 = {
      status: 'PASS', cultivarId: RAINBOW_ID, presentation: RAINBOW_PRESENTATION,
      rootLineage, rootExplanationPreserved: true, evidenceFooterAtBottom: Boolean(evidenceRow),
      aliases, derivedLines: RAINBOW_DERIVED.map(line => ({ name: line.name, lineage: line.lineage })),
      separateRelationshipCard: false, autoRow: false, contract: RAINBOW_CONTRACT
    };
    return true;
  };

  const decorateUniversal = ({ id, cultivar, root, lineageCard }) => {
    setIntegratedTitle(lineageCard);
    const body = lineageCard.querySelector(':scope > div');
    if (!body) return false;

    let integrated = body.querySelector(':scope > [data-sitewide-lineage-integrated="v1"]');
    const aliases = unique(cultivar.aliases).filter(alias => alias !== cultivar.name);
    if (!integrated && aliases.length) {
      integrated = document.createElement('section');
      integrated.className = 'csw-name-rel-integrated csw-name-rel-integrated-sitewide';
      integrated.dataset.sitewideLineageIntegrated = 'v1';
      const aliasRow = makeAliasRow(aliases, { standalone: true });
      if (aliasRow) integrated.appendChild(aliasRow);
      const evidence = body.querySelector(':scope > .ucd-evidence-row') || lineageCard.querySelector('.ucd-evidence-row');
      if (evidence) body.insertBefore(integrated, evidence);
      else body.appendChild(integrated);
    }

    const evidenceFooterAtBottom = moveEvidenceFooterLast(lineageCard);
    lineageCard.dataset.sitewideLineage = 'v1';
    root.dataset.sitewideLineageRelationships = 'v1';
    window.__CSWSitewideLineageRelationshipsV1 = {
      status: 'PASS', contract: SITEWIDE_CONTRACT, cultivarId: id,
      lineageStatus: text(cultivar?.lineage?.status) || 'unknown',
      aliases, aliasCount: aliases.length, evidenceFooterAtBottom
    };
    return true;
  };

  const decorate = async () => {
    const state = await resolveCurrent();
    if (!state) return false;
    return state.id === RAINBOW_ID ? decorateRainbow(state) : decorateUniversal(state);
  };

  if (!document.getElementById('csw-name-relationships-v1-style')) {
    const style = document.createElement('style');
    style.id = 'csw-name-relationships-v1-style';
    style.textContent = `
      .ucd-lineage[data-sitewide-lineage="v1"]>summary>span>small{letter-spacing:.10em}
      .ucd-lineage[data-sitewide-lineage="v1"]>div{padding-bottom:11px}
      .ucd-lineage[data-sitewide-lineage="v1"] .ucd-evidence-row{display:flex;align-items:center;justify-content:flex-end;gap:9px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid rgba(216,189,98,.13)}
      .ucd-lineage[data-sitewide-lineage="v1"] .ucd-evidence-row>a{margin-left:0!important}
      .csw-name-rel-integrated{display:grid;margin-top:11px;padding-top:10px;border-top:1px solid rgba(216,189,98,.13)}
      .csw-name-rel-integrated-sitewide{padding-bottom:1px}
      .csw-name-rel-rail-item,.csw-name-rel-alias-row{display:grid;grid-template-columns:22px minmax(0,1fr);gap:7px;min-width:0}
      .csw-name-rel-alias-row.is-standalone{grid-template-columns:minmax(0,1fr)}
      .csw-name-rel-alias-row.is-standalone>.csw-name-rel-track{display:none}
      .csw-name-rel-rail-item{padding:5px 0}
      .csw-name-rel-name-block{display:grid;gap:3px;min-width:0;padding:7px 0}
      .csw-name-rel-name{min-width:0;color:#edf0ec;font-size:13px;font-weight:820;line-height:1.32}
      .csw-name-rel-lineage{margin:0!important;color:#a8b5ad;font-size:11px!important;font-weight:620;line-height:1.38!important;overflow-wrap:anywhere}
      .csw-name-rel-relation{display:flex;justify-content:flex-start;margin-top:1px}
      .csw-name-rel-label{display:inline-flex;align-items:baseline;gap:5px;color:#9fb0a6;font-size:9px;font-weight:800;line-height:1.15}
      .csw-name-rel-label small,.csw-name-rel-section-label small{color:#667a70;font-size:8px;font-weight:850;letter-spacing:.10em;line-height:1.2}
      .csw-name-rel-section-label{display:flex;align-items:baseline;gap:6px;color:#94a29a}
      .csw-name-rel-section-label strong{font-size:10px;font-weight:800;line-height:1.3}
      .csw-name-rel-alias-row{padding:2px 0 6px}
      .csw-name-rel-alias-block{display:grid;gap:6px;padding:4px 0 7px}
      .csw-name-rel-chips{display:flex;flex-wrap:wrap;gap:5px}
      .csw-name-rel-chip{display:inline-flex;align-items:center;min-height:22px;padding:3px 8px;border:1px solid rgba(255,255,255,.085);border-radius:999px;background:rgba(255,255,255,.022);color:#b8c3bc;font-size:10px;font-weight:760;line-height:1.15}
      .csw-name-rel-track{position:relative;display:block;min-height:100%}
      .csw-name-rel-track:before{content:'';position:absolute;left:10px;top:-10px;bottom:-10px;width:1px;background:linear-gradient(rgba(216,189,98,.42),rgba(216,189,98,.22))}
      .csw-name-rel-track.is-last:before{bottom:calc(100% - 12px)}
      .csw-name-rel-node{position:absolute;left:6px;top:9px;width:9px;height:9px;border:2px solid rgba(216,189,98,.72);border-radius:50%;background:#0a1710;box-shadow:0 0 0 3px rgba(216,189,98,.05)}
      @media(max-width:390px){
        .ucd-lineage[data-sitewide-lineage="v1"]>summary>span>small{font-size:8px;letter-spacing:.075em}
        .csw-name-rel-integrated{margin-top:10px;padding-top:9px}
        .csw-name-rel-name{font-size:12.5px}
        .csw-name-rel-lineage{font-size:10.5px!important}
        .csw-name-rel-rail-item,.csw-name-rel-alias-row{grid-template-columns:20px minmax(0,1fr);gap:6px}
        .csw-name-rel-alias-row.is-standalone{grid-template-columns:minmax(0,1fr)}
        .csw-name-rel-track:before{left:9px}
        .csw-name-rel-node{left:5px}
      }
    `;
    document.head.appendChild(style);
  }

  let queued = false;
  const schedule = () => {
    if (queued || !currentId()) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      decorate().catch(error => {
        const id = currentId();
        if (id === RAINBOW_ID) window.__CSWRainbowBeltsNameRelationshipRailV1 = { status: 'FAIL_CLOSED', error: String(error?.message || error) };
        window.__CSWSitewideLineageRelationshipsV1 = { status: 'FAIL_CLOSED', cultivarId: id, error: String(error?.message || error) };
        console.error(SITEWIDE_CONTRACT, error);
        queueMicrotask(() => { throw error; });
      });
    });
  };

  new MutationObserver(schedule).observe(shell, { childList: true, subtree: true });
  shell.addEventListener('click', schedule, true);
  window.addEventListener('popstate', schedule);
  schedule();
  setTimeout(schedule, 250);
  setTimeout(schedule, 1000);

  setTimeout(() => {
    const id = currentId();
    if (!id) return;
    const root = shell.querySelector(`.detail-public-v1[data-public-detail-id="${id}"],.ucd-root[data-public-detail-id="${id}"]`);
    if (root && root.dataset.sitewideLineageRelationships !== 'v1') {
      throw new Error(`SITEWIDE_LINEAGE_RELATIONSHIPS_NOT_INTEGRATED:${id}`);
    }
  }, 8000);
})();
