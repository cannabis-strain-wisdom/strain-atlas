(() => {
  'use strict';

  const TARGET_ID = 'rainbow-belts';
  const CONTRACT = 'RAINBOW_BELTS_NAME_RELATIONSHIP_RAIL_V1';
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

  const makeTrack = ({ root = false, last = false } = {}) => {
    const track = document.createElement('span');
    track.className = 'csw-name-rel-track';
    if (root) track.classList.add('is-root');
    if (last) track.classList.add('is-last');
    track.setAttribute('aria-hidden', 'true');
    const node = document.createElement('span');
    node.className = 'csw-name-rel-node';
    track.appendChild(node);
    return track;
  };

  const makeRelationshipLabel = (ja, en, tone) => {
    const label = document.createElement('span');
    label.className = `csw-name-rel-label is-${tone}`;
    const jaNode = document.createElement('span');
    jaNode.textContent = ja;
    const enNode = document.createElement('small');
    enNode.textContent = en;
    label.append(jaNode, enNode);
    return label;
  };

  const makeNameBlock = ({ name, lineage, ja, en, tone, root = false }) => {
    const block = document.createElement('div');
    block.className = 'csw-name-rel-name-block';
    if (root) block.classList.add('is-root');
    const title = document.createElement('strong');
    title.className = 'csw-name-rel-name';
    title.textContent = name;
    const formula = document.createElement('p');
    formula.className = 'csw-name-rel-lineage';
    formula.textContent = lineage;
    const relation = document.createElement('div');
    relation.className = 'csw-name-rel-relation';
    relation.appendChild(makeRelationshipLabel(ja, en, tone));
    block.append(title, formula, relation);
    return block;
  };

  const makeAliasRow = aliases => {
    if (!aliases.length) return null;
    const row = document.createElement('div');
    row.className = 'csw-name-rel-alias-row';
    const track = document.createElement('span');
    track.className = 'csw-name-rel-track';
    track.setAttribute('aria-hidden', 'true');
    row.appendChild(track);

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
    if (!cultivar || !root) return false;
    if (text(cultivar.name) !== 'Rainbow Belts') throw new Error('RAINBOW_BELTS_CANONICAL_NAME_MISMATCH');
    const rootLineage = text(cultivar?.lineage?.display);
    if (!rootLineage) throw new Error('RAINBOW_BELTS_ROOT_LINEAGE_MISSING');
    assertBoundarySources(catalog);

    const legacy = root.querySelector('[data-identity-family-pilot="v1"]');
    const legacyWasOpen = Boolean(legacy?.open);
    if (legacy) {
      legacy.hidden = true;
      legacy.setAttribute('aria-hidden', 'true');
      legacy.dataset.replacedByNameRelationships = 'v1';
    }

    if (root.querySelector('[data-name-relationships="v1"]')) return true;

    const aliases = unique(cultivar.aliases).filter(alias => alias !== cultivar.name && !/\b(?:2\.0|3\.0|auto)\b/i.test(alias));
    const card = document.createElement('details');
    card.className = 'csw-name-rel-card';
    card.dataset.nameRelationships = 'v1';
    if (legacyWasOpen) card.open = true;

    const summary = document.createElement('summary');
    const copy = document.createElement('span');
    copy.className = 'csw-name-rel-summary-copy';
    const title = document.createElement('strong');
    title.textContent = '名前・系統関係';
    const english = document.createElement('small');
    english.textContent = 'NAME & RELATIONSHIPS';
    copy.append(title, english);
    const chevron = document.createElement('i');
    chevron.className = 'csw-name-rel-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '⌄';
    summary.append(copy, chevron);

    const body = document.createElement('div');
    body.className = 'csw-name-rel-body';

    const rootRow = document.createElement('div');
    rootRow.className = 'csw-name-rel-rail-item is-root';
    rootRow.append(
      makeTrack({ root: true }),
      makeNameBlock({
        name: cultivar.name,
        lineage: rootLineage,
        ja: '元の品種',
        en: 'ROOT',
        tone: 'root',
        root: true
      })
    );
    body.appendChild(rootRow);

    const aliasRow = makeAliasRow(aliases);
    if (aliasRow) body.appendChild(aliasRow);

    DERIVED.forEach((line, index) => {
      const row = document.createElement('div');
      row.className = 'csw-name-rel-rail-item';
      row.append(
        makeTrack({ last: index === DERIVED.length - 1 }),
        makeNameBlock({
          name: line.name,
          lineage: line.lineage,
          ja: '別系統',
          en: 'DERIVED LINE',
          tone: 'derived'
        })
      );
      body.appendChild(row);
    });

    card.append(summary, body);
    if (legacy) legacy.insertAdjacentElement('beforebegin', card);
    else root.prepend(card);
    root.dataset.nameRelationships = 'v1';
    window.__CSWRainbowBeltsNameRelationshipRailV1 = {
      status: 'PASS',
      cultivarId: TARGET_ID,
      aliases,
      rootLineage,
      derivedLines: DERIVED.map(line => ({ name: line.name, lineage: line.lineage })),
      autoRow: false,
      contract: CONTRACT
    };
    return true;
  };

  if (!document.getElementById('csw-name-relationships-v1-style')) {
    const style = document.createElement('style');
    style.id = 'csw-name-relationships-v1-style';
    style.textContent = `
      .csw-name-rel-card{margin:13px 14px 4px;overflow:hidden;border:1px solid rgba(216,189,98,.18);border-radius:15px;background:linear-gradient(145deg,rgba(13,31,21,.78),rgba(5,14,9,.95));box-shadow:inset 0 1px 0 rgba(255,255,255,.02)}
      .csw-name-rel-card>summary{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;min-height:54px;padding:10px 12px;cursor:pointer;list-style:none;color:#eef1ec}
      .csw-name-rel-card>summary::-webkit-details-marker{display:none}
      .csw-name-rel-summary-copy{display:grid;gap:2px;min-width:0}
      .csw-name-rel-summary-copy strong{font-size:14px;font-weight:790;line-height:1.3}
      .csw-name-rel-summary-copy small,.csw-name-rel-section-label small,.csw-name-rel-label small{font-size:8px;font-weight:850;letter-spacing:.10em;line-height:1.2}
      .csw-name-rel-summary-copy small{color:#8d9b93}
      .csw-name-rel-chevron{color:#d8bd62;font-size:16px;font-style:normal;line-height:1;transition:transform .16s ease}
      .csw-name-rel-card[open] .csw-name-rel-chevron{transform:rotate(180deg)}
      .csw-name-rel-body{display:grid;padding:8px 12px 11px;border-top:1px solid rgba(216,189,98,.11)}
      .csw-name-rel-rail-item,.csw-name-rel-alias-row{display:grid;grid-template-columns:22px minmax(0,1fr);gap:7px;min-width:0}
      .csw-name-rel-rail-item{padding:5px 0}
      .csw-name-rel-rail-item.is-root{padding:6px 0 4px}
      .csw-name-rel-name-block{display:grid;gap:3px;min-width:0;padding:7px 0}
      .csw-name-rel-name-block.is-root{padding:10px 11px;border:1px solid rgba(216,189,98,.24);border-radius:12px;background:linear-gradient(135deg,rgba(216,189,98,.075),rgba(255,255,255,.018));box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}
      .csw-name-rel-name{min-width:0;color:#edf0ec;font-size:13px;font-weight:820;line-height:1.32}
      .csw-name-rel-name-block.is-root .csw-name-rel-name{font-size:14px}
      .csw-name-rel-lineage{margin:0;color:#a8b5ad;font-size:11px;font-weight:620;line-height:1.38;overflow-wrap:anywhere}
      .csw-name-rel-name-block.is-root .csw-name-rel-lineage{color:#c0c9c3}
      .csw-name-rel-relation{display:flex;justify-content:flex-start;margin-top:1px}
      .csw-name-rel-label{display:inline-flex;align-items:baseline;gap:5px;color:#8fa198;font-size:9px;font-weight:800;line-height:1.15}
      .csw-name-rel-label small{color:#667a70}
      .csw-name-rel-label.is-root{color:#d8bd62}
      .csw-name-rel-label.is-root small{color:#998743}
      .csw-name-rel-label.is-derived{color:#9fb0a6}
      .csw-name-rel-section-label{display:flex;align-items:baseline;gap:6px;color:#94a29a}
      .csw-name-rel-section-label strong{font-size:10px;font-weight:800;line-height:1.3}
      .csw-name-rel-section-label small{color:#6f8077}
      .csw-name-rel-alias-row{padding:3px 0 6px}
      .csw-name-rel-alias-block{display:grid;gap:6px;padding:5px 0 7px}
      .csw-name-rel-chips{display:flex;flex-wrap:wrap;gap:5px}
      .csw-name-rel-chip{display:inline-flex;align-items:center;min-height:22px;padding:3px 8px;border:1px solid rgba(255,255,255,.085);border-radius:999px;background:rgba(255,255,255,.022);color:#b8c3bc;font-size:10px;font-weight:760;line-height:1.15}
      .csw-name-rel-track{position:relative;display:block;min-height:100%}
      .csw-name-rel-track:before{content:'';position:absolute;left:10px;top:-9px;bottom:-9px;width:1px;background:linear-gradient(rgba(216,189,98,.48),rgba(216,189,98,.24))}
      .csw-name-rel-track.is-root:before{top:12px}
      .csw-name-rel-track.is-last:before{bottom:calc(100% - 12px)}
      .csw-name-rel-node{position:absolute;left:6px;top:9px;width:9px;height:9px;border:2px solid rgba(216,189,98,.72);border-radius:50%;background:#0a1710;box-shadow:0 0 0 3px rgba(216,189,98,.05)}
      .csw-name-rel-rail-item.is-root .csw-name-rel-node{top:12px;border-color:#d8bd62;background:#13251a;box-shadow:0 0 0 4px rgba(216,189,98,.07)}
      @media(max-width:390px){.csw-name-rel-card{margin-inline:12px}.csw-name-rel-body{padding-inline:10px}.csw-name-rel-summary-copy strong{font-size:13.5px}.csw-name-rel-name{font-size:12.5px}.csw-name-rel-name-block.is-root .csw-name-rel-name{font-size:13.5px}.csw-name-rel-lineage{font-size:10.5px}.csw-name-rel-rail-item,.csw-name-rel-alias-row{grid-template-columns:20px minmax(0,1fr);gap:6px}.csw-name-rel-track:before{left:9px}.csw-name-rel-node{left:5px}}
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
    if (currentId() === TARGET_ID && !document.querySelector('[data-name-relationships="v1"]')) {
      throw new Error('RAINBOW_BELTS_NAME_RELATIONSHIP_RAIL_NOT_RENDERED');
    }
  }, 8000);
})();
