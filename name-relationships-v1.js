(() => {
  'use strict';

  const TARGET_ID = 'rainbow-belts';
  const CONTRACT = 'RAINBOW_BELTS_NAME_RELATIONSHIP_RAIL_V1';
  const PRESENTATION = 'RAINBOW_BELTS_LINEAGE_RELATIONSHIPS_INTEGRATED_V2';
  const DERIVED = [
    {
      sourceId: 'archive-rainbow-belts-2-0',
      name: 'Rainbow Belts 2.0',
      lineage: 'Rainbow Belts #20 × Rainbow Belts F1'
    },
    {
      sourceId: 'archive-rainbow-belts-3-0',
      name: 'Rainbow Belts 3.0',
      lineage: 'Rainbow Belts #20 × Moonbow #112 F2 #60'
    }
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

  const makeAliasRow = aliases => {
    if (!aliases.length) return null;
    const row = document.createElement('div');
    row.className = 'csw-name-rel-alias-row';
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

  const assertBoundarySources = catalog => {
    for (const line of DERIVED) {
      const source = catalog?.sources?.[line.sourceId];
      if (!source || source.sourceType !== 'breederOfficial' || text(source.publisher) !== 'Archive Seed Bank' || text(source.title) !== line.name) {
        throw new Error(`RAINBOW_BELTS_DERIVED_SOURCE_MISMATCH:${line.sourceId}`);
      }
    }
  };

  const decorate = async () => {
    if (currentId() !== TARGET_ID) return false;

    const catalog = await loadCatalog();
    const cultivar = (catalog?.cultivars || []).find(item => item?.id === TARGET_ID);
    const root = shell.querySelector(`.detail-public-v1[data-public-detail-id="${TARGET_ID}"],.ucd-root[data-public-detail-id="${TARGET_ID}"]`);
    const lineageCard = shell.querySelector('.ucd-lineage');
    if (!cultivar || !root || !lineageCard) return false;

    if (text(cultivar.name) !== 'Rainbow Belts') throw new Error('RAINBOW_BELTS_CANONICAL_NAME_MISMATCH');
    const rootLineage = text(cultivar?.lineage?.display);
    if (!rootLineage) throw new Error('RAINBOW_BELTS_ROOT_LINEAGE_MISSING');
    assertBoundarySources(catalog);

    let body = lineageCard.querySelector(':scope > div');
    if (lineageCard.dataset.lineageRelationships === 'v2' && body?.querySelector('[data-name-relationships-integrated="v2"]')) {
      return true;
    }

    const legacy = root.querySelector('[data-identity-family-pilot="v1"]');
    if (legacy) {
      legacy.hidden = true;
      legacy.setAttribute('aria-hidden', 'true');
      legacy.dataset.replacedByNameRelationships = 'v2';
    }

    root.querySelector('[data-name-relationships="v1"]')?.remove();

    const summaryKicker = lineageCard.querySelector(':scope > summary > span > small');
    if (!summaryKicker) throw new Error('RAINBOW_BELTS_LINEAGE_SUMMARY_KICKER_MISSING');
    const integratedTitle = '系譜・系統関係 / LINEAGE & RELATIONSHIPS';
    if (summaryKicker.textContent !== integratedTitle) summaryKicker.textContent = integratedTitle;

    body = lineageCard.querySelector(':scope > div');
    if (!body) {
      body = document.createElement('div');
      lineageCard.appendChild(body);
    }

    if (body.querySelector('[data-name-relationships-integrated="v2"]')) return true;

    const aliases = unique(cultivar.aliases).filter(alias => alias !== cultivar.name && !/\b(?:2\.0|3\.0|auto)\b/i.test(alias));
    const integrated = document.createElement('section');
    integrated.className = 'csw-name-rel-integrated';
    integrated.dataset.nameRelationshipsIntegrated = 'v2';

    const aliasRow = makeAliasRow(aliases);
    if (aliasRow) integrated.appendChild(aliasRow);

    DERIVED.forEach((line, index) => {
      const row = document.createElement('div');
      row.className = 'csw-name-rel-rail-item';
      row.append(
        makeTrack({ node: true, last: index === DERIVED.length - 1 }),
        makeDerivedBlock(line)
      );
      integrated.appendChild(row);
    });

    body.appendChild(integrated);
    lineageCard.dataset.lineageRelationships = 'v2';
    root.dataset.nameRelationships = 'v2';

    window.__CSWRainbowBeltsNameRelationshipRailV1 = {
      status: 'PASS',
      cultivarId: TARGET_ID,
      presentation: PRESENTATION,
      rootLineage,
      rootExplanationPreserved: true,
      aliases,
      derivedLines: DERIVED.map(line => ({ name: line.name, lineage: line.lineage })),
      separateRelationshipCard: false,
      autoRow: false,
      contract: CONTRACT
    };
    return true;
  };

  if (!document.getElementById('csw-name-relationships-v1-style')) {
    const style = document.createElement('style');
    style.id = 'csw-name-relationships-v1-style';
    style.textContent = `
      .ucd-lineage[data-lineage-relationships="v2"]>summary>span>small{letter-spacing:.10em}
      .ucd-lineage[data-lineage-relationships="v2"]>div{padding-bottom:11px}
      .ucd-lineage[data-lineage-relationships="v2"] .ucd-evidence-row{display:flex;align-items:center;justify-content:flex-end;gap:9px;flex-wrap:wrap}
      .ucd-lineage[data-lineage-relationships="v2"] .ucd-evidence-row>a{margin-left:0!important}
      .csw-name-rel-integrated{display:grid;margin-top:11px;padding-top:10px;border-top:1px solid rgba(216,189,98,.13)}
      .csw-name-rel-rail-item,.csw-name-rel-alias-row{display:grid;grid-template-columns:22px minmax(0,1fr);gap:7px;min-width:0}
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
        .ucd-lineage[data-lineage-relationships="v2"]>summary>span>small{font-size:8px;letter-spacing:.075em}
        .csw-name-rel-integrated{margin-top:10px;padding-top:9px}
        .csw-name-rel-name{font-size:12.5px}
        .csw-name-rel-lineage{font-size:10.5px!important}
        .csw-name-rel-rail-item,.csw-name-rel-alias-row{grid-template-columns:20px minmax(0,1fr);gap:6px}
        .csw-name-rel-track:before{left:9px}
        .csw-name-rel-node{left:5px}
      }
    `;
    document.head.appendChild(style);
  }

  let queued = false;
  const schedule = () => {
    if (queued || currentId() !== TARGET_ID) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      decorate().catch(error => {
        window.__CSWRainbowBeltsNameRelationshipRailV1 = { status: 'FAIL_CLOSED', error: String(error?.message || error) };
        console.error(CONTRACT, error);
        queueMicrotask(() => { throw error; });
      });
    });
  };

  new MutationObserver(schedule).observe(shell, { childList: true, subtree: true });
  shell.addEventListener('click', schedule, true);
  window.addEventListener('popstate', schedule);
  schedule();

  setTimeout(() => {
    if (currentId() === TARGET_ID && !document.querySelector('[data-name-relationships-integrated="v2"]')) {
      throw new Error('RAINBOW_BELTS_LINEAGE_RELATIONSHIPS_NOT_INTEGRATED');
    }
  }, 8000);
})();
