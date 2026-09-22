(() => {
  'use strict';

  const RAINBOW_ID = 'rainbow-belts';
  const RAINBOW_CONTRACT = 'RAINBOW_BELTS_NAME_RELATIONSHIP_RAIL_V1';
  const RAINBOW_PRESENTATION = 'RAINBOW_BELTS_LINEAGE_RELATIONSHIPS_INTEGRATED_V2';
  const SITEWIDE_CONTRACT = 'CSW_SITEWIDE_LINEAGE_RELATIONSHIPS_V1';
  const LINEAGE_MAP_CONTRACT = 'CSW_LINEAGE_MAP_V1';
  const LINEAGE_MAP_MAX_DEPTH = 3;
  const LINEAGE_MAP_UPSTREAM_CONTEXT = new Map([
    ['do-si-dos', new Map([
      ['ogkb', 'Cookies / GSC side'],
      ['face off og bx1', 'OG side']
    ])]
  ]);
  const INTEGRATED_TITLE = '系譜・系統関係 / LINEAGE & RELATIONSHIPS';
  const RAINBOW_DERIVED = [
    { sourceId: 'archive-rainbow-belts-2-0', name: 'Rainbow Belts 2.0', lineage: 'Rainbow Belts #20 × Rainbow Belts F1' },
    { sourceId: 'archive-rainbow-belts-3-0', name: 'Rainbow Belts 3.0', lineage: 'Rainbow Belts #20 × Moonbow #112 F2 #60' }
  ];
  const CHILD_RELATIONSHIP_ROOT_IDS = new Set([
    'acapulco-gold',
    'ak-47',
    'warlock',
    'papaya',
    'skunk-1',
    'super-skunk',
    'sunset-sherbert',
    'og-kush'
  ]);
  const EXPLICIT_TYPED_RELATIONSHIPS = new Map([
    ['og-kush', [
      {
        targetId: 'the-og-18',
        relationshipType: 'selection',
        relationshipDisplay: 'OG Kushから選抜・再フェミナイズ',
        requiredSourceRefs: ['dna-eu-the-og-18'],
        expectedGeneration: 'unknown'
      }
    ]]
  ]);

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

  const makeRelationshipLabel = (ja, en, tone = 'derived') => {
    const label = document.createElement('span');
    label.className = `csw-name-rel-label is-${tone}`;
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

  const makeChildBlock = line => {
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
    relation.appendChild(makeRelationshipLabel('子系統', 'CHILD LINE', 'child'));
    block.append(title, formula, relation);
    return block;
  };

  const makeSelectionBlock = line => {
    const block = document.createElement('div');
    block.className = 'csw-name-rel-name-block';
    const title = document.createElement('strong');
    title.className = 'csw-name-rel-name';
    title.textContent = line.name;
    const formula = document.createElement('p');
    formula.className = 'csw-name-rel-lineage';
    formula.textContent = line.relationshipDisplay;
    const relation = document.createElement('div');
    relation.className = 'csw-name-rel-relation';
    relation.appendChild(makeRelationshipLabel('選抜系統', 'SELECTION', 'selection'));
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

  const normalizeIdentity = value => text(value).normalize('NFKC').toLowerCase();

  const selectionSpecsFor = parent => {
    const projected = parent?.publicPresentation?.nameRelationships?.selections;
    if (Array.isArray(projected) && projected.length) {
      return projected.map((line, index) => {
        if (line?.relationshipType !== 'selection' || !text(line?.id) || !text(line?.relationshipDisplay)) {
          throw new Error(`SELECTION_RELATIONSHIP_PROJECTED_INVALID:${parent?.id || 'unknown'}:${index}`);
        }
        return {
          targetId: text(line.id),
          relationshipType: 'selection',
          relationshipDisplay: text(line.relationshipDisplay),
          requiredSourceRefs: [],
          expectedGeneration: null
        };
      });
    }
    return EXPLICIT_TYPED_RELATIONSHIPS.get(parent?.id) || [];
  };

  const resolveChildLines = (catalog, parent) => {
    if (!CHILD_RELATIONSHIP_ROOT_IDS.has(parent?.id)) return [];
    const explicitNonChildTargets = new Set(selectionSpecsFor(parent).map(line => text(line?.targetId)).filter(Boolean));
    const parentNames = new Set(unique([parent?.name, ...(parent?.aliases || [])]).map(normalizeIdentity));
    return (catalog?.cultivars || [])
      .filter(child => {
        if (!child || child.id === parent.id || explicitNonChildTargets.has(child.id)) return false;
        if (text(child?.lineage?.status) !== 'confirmed' || text(child?.lineage?.basis) !== 'breederOfficial') return false;
        if (!Array.isArray(child?.lineage?.sourceRefs) || !child.lineage.sourceRefs.length) return false;
        const parents = unique(child?.lineage?.parents || []).map(normalizeIdentity);
        return parents.some(name => parentNames.has(name));
      })
      .map(child => {
        const name = text(child.name);
        const lineage = text(child?.lineage?.display);
        if (!name || !lineage) throw new Error(`CHILD_RELATIONSHIP_DISPLAY_INCOMPLETE:${parent.id}:${child.id}`);
        return { id: child.id, name, lineage, relationshipType: 'child-line' };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  };

  const resolveSelectionLines = (catalog, parent) => {
    const specs = selectionSpecsFor(parent);
    if (!specs.length) return [];
    const parentNames = new Set(unique([parent?.name, ...(parent?.aliases || [])]).map(normalizeIdentity));
    return specs.map((spec, index) => {
      if (spec?.relationshipType !== 'selection') throw new Error(`SELECTION_RELATIONSHIP_TYPE_INVALID:${parent?.id || 'unknown'}:${index}`);
      const targetId = text(spec?.targetId);
      const target = (catalog?.cultivars || []).find(item => item?.id === targetId);
      if (!target) throw new Error(`SELECTION_RELATIONSHIP_TARGET_MISSING:${parent?.id || 'unknown'}:${targetId || index}`);
      if (text(target?.lineage?.status) !== 'confirmed' || text(target?.lineage?.basis) !== 'breederOfficial') {
        throw new Error(`SELECTION_RELATIONSHIP_EVIDENCE_INCOMPLETE:${parent.id}:${target.id}`);
      }
      if (!Array.isArray(target?.lineage?.sourceRefs) || !target.lineage.sourceRefs.length) {
        throw new Error(`SELECTION_RELATIONSHIP_SOURCES_MISSING:${parent.id}:${target.id}`);
      }
      const requiredSourceRefs = unique(spec?.requiredSourceRefs || []);
      if (requiredSourceRefs.some(sourceRef => !target.lineage.sourceRefs.includes(sourceRef))) {
        throw new Error(`SELECTION_RELATIONSHIP_SOURCE_MISMATCH:${parent.id}:${target.id}`);
      }
      const parents = unique(target?.lineage?.parents || []).map(normalizeIdentity);
      if (!parents.some(name => parentNames.has(name))) {
        throw new Error(`SELECTION_RELATIONSHIP_PARENT_MISMATCH:${parent.id}:${target.id}`);
      }
      if (spec?.expectedGeneration && text(target?.breeding?.generation) !== spec.expectedGeneration) {
        throw new Error(`SELECTION_RELATIONSHIP_GENERATION_CHANGED:${parent.id}:${target.id}`);
      }
      const name = text(target?.name);
      const relationshipDisplay = text(spec?.relationshipDisplay);
      if (!name || !relationshipDisplay) throw new Error(`SELECTION_RELATIONSHIP_DISPLAY_INCOMPLETE:${parent.id}:${target.id}`);
      if (/\b(?:S1|BX)\b/i.test(relationshipDisplay)) throw new Error(`SELECTION_RELATIONSHIP_GENERATION_LABEL_FORBIDDEN:${parent.id}:${target.id}`);
      return { id: target.id, name, relationshipDisplay, relationshipType: 'selection' };
    });
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

  const normalizeLineageIdentity = value => String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  const confirmedLineageParents = cultivar => {
    const lineage = cultivar?.lineage;
    if (!lineage || text(lineage.status) !== 'confirmed') return [];
    return unique(lineage.parents || []);
  };

  const lineageUpstreamLabel = (rootId, parentLabel) =>
    text(LINEAGE_MAP_UPSTREAM_CONTEXT.get(rootId)?.get(normalizeLineageIdentity(parentLabel)));

  const buildLineageResolver = catalog => {
    const index = new Map();
    for (const item of catalog?.cultivars || []) {
      for (const raw of [item?.id, item?.name, ...(item?.aliases || [])]) {
        const key = normalizeLineageIdentity(raw);
        if (!key) continue;
        const bucket = index.get(key) || [];
        if (!bucket.some(candidate => candidate.id === item.id)) bucket.push(item);
        index.set(key, bucket);
      }
    }
    return label => {
      const matches = index.get(normalizeLineageIdentity(label)) || [];
      return matches.length === 1 ? matches[0] : null;
    };
  };

  const buildLineageMapGraph = (cultivar, resolve) => {
    let serial = 0;
    const edges = [];
    const makeNode = (label, resolved, depth, pathIds, isRoot = false) => {
      const key = `lm-${serial++}`;
      const nextPath = new Set(pathIds);
      if (resolved?.id) nextPath.add(resolved.id);
      const node = {
        key,
        label: text(label) || text(resolved?.name) || 'Unknown',
        cultivar: resolved,
        isRoot,
        upstreamLabel: depth === 1 ? lineageUpstreamLabel(cultivar?.id, label) : '',
        parents: []
      };
      if (!resolved || depth >= LINEAGE_MAP_MAX_DEPTH) return node;
      for (const parentLabel of confirmedLineageParents(resolved)) {
        const parentResolved = resolve(parentLabel);
        const cycle = Boolean(parentResolved?.id && nextPath.has(parentResolved.id));
        const parent = makeNode(parentLabel, cycle ? null : parentResolved, depth + 1, nextPath, false);
        parent.cycle = cycle;
        node.parents.push(parent);
        edges.push({ from: parent.key, to: node.key });
      }
      return node;
    };
    return {
      root: makeNode(cultivar?.name, cultivar, 0, new Set(), true),
      edges
    };
  };

  const lineageHref = cultivarId => {
    const url = new URL(location.href);
    url.searchParams.set('strain', cultivarId);
    url.hash = '';
    return `${url.pathname}${url.search}`;
  };

  const makeLineageMapNode = node => {
    const linked = Boolean(node.cultivar && !node.isRoot);
    const element = document.createElement(linked ? 'a' : 'div');
    element.className = `csw-lineage-map-node${node.isRoot ? ' is-root' : ''}${linked ? ' is-linked' : ''}${node.cycle ? ' is-cycle' : ''}`;
    element.dataset.lineageNodeKey = node.key;
    if (linked) {
      element.href = lineageHref(node.cultivar.id);
      element.setAttribute('aria-label', `${node.label}の詳細を見る`);
    }
    const name = document.createElement('strong');
    name.textContent = node.label;
    const meta = document.createElement('small');
    meta.textContent = node.isRoot ? 'CURRENT' : linked ? 'CSW' : 'PARENT';
    element.append(name, meta);
    return element;
  };

  const renderLineageMapBranch = node => {
    const branch = document.createElement('div');
    branch.className = 'csw-lineage-map-branch';
    if (node.parents.length) {
      const parents = document.createElement('div');
      parents.className = 'csw-lineage-map-parents';
      node.parents.forEach(parent => parents.appendChild(renderLineageMapBranch(parent)));
      branch.appendChild(parents);
    }

    const stack = document.createElement('div');
    stack.className = 'csw-lineage-map-node-stack';
    if (node.upstreamLabel) {
      const upstream = document.createElement('div');
      upstream.className = 'csw-lineage-map-upstream';
      upstream.dataset.lineageUpstreamFor = node.label;
      upstream.dataset.lineageUpstreamContext = 'family-side';
      upstream.textContent = node.upstreamLabel;
      upstream.setAttribute('aria-label', `${node.label}の上流系統: ${node.upstreamLabel}`);
      stack.appendChild(upstream);
    }
    stack.appendChild(makeLineageMapNode(node));
    branch.appendChild(stack);
    return branch;
  };

  const decorateLineageMap = ({ id, catalog, cultivar, root, lineageCard }) => {
    if (!confirmedLineageParents(cultivar).length) return false;
    const body = lineageCard.querySelector(':scope > div');
    if (!body) return false;
    if (body.querySelector(`[data-lineage-map-v1="${CSS.escape(id)}"]`)) {
      root.dataset.lineageMapV1 = 'ready';
      return true;
    }

    const resolve = buildLineageResolver(catalog);
    const graph = buildLineageMapGraph(cultivar, resolve);
    if (!graph.root.parents.length) return false;

    const section = document.createElement('section');
    section.className = 'csw-lineage-map-v1';
    section.dataset.lineageMapV1 = id;

    const heading = document.createElement('div');
    heading.className = 'csw-lineage-map-heading';
    const headingTitle = document.createElement('span');
    headingTitle.textContent = 'LINEAGE MAP / 系統図';
    const headingMeta = document.createElement('small');
    headingMeta.textContent = '確認済みの親子関係のみ';
    heading.append(headingTitle, headingMeta);

    const viewport = document.createElement('div');
    viewport.className = 'csw-lineage-map-viewport';
    viewport.setAttribute('role', 'region');
    viewport.setAttribute('aria-label', `${cultivar.name}の系統図`);
    viewport.tabIndex = 0;

    const inner = document.createElement('div');
    inner.className = 'csw-lineage-map-inner';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('csw-lineage-map-edges');
    svg.setAttribute('aria-hidden', 'true');
    const tree = document.createElement('div');
    tree.className = 'csw-lineage-map-tree';
    tree.appendChild(renderLineageMapBranch(graph.root));
    inner.append(svg, tree);
    viewport.appendChild(inner);

    const note = document.createElement('p');
    note.className = 'csw-lineage-map-note';
    note.textContent = section.querySelector('.csw-lineage-map-upstream')
      ? '主線は確認済みのdirect parentのみ。小さな点線ラベルは上流のfamily contextで、parent nodeではありません。'
      : '現在のCSWで確認済みのdirect parentだけを接続。名称や系統イメージだけでは推測接続しません。';

    section.append(heading, viewport, note);
    body.prepend(section);

    let centered = false;
    const draw = () => {
      if (!section.isConnected || viewport.offsetParent === null) return;
      const width = Math.max(inner.scrollWidth, inner.clientWidth);
      const height = Math.max(inner.scrollHeight, inner.clientHeight);
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      svg.replaceChildren();

      const innerRect = inner.getBoundingClientRect();
      for (const edge of graph.edges) {
        const from = inner.querySelector(`[data-lineage-node-key="${CSS.escape(edge.from)}"]`);
        const to = inner.querySelector(`[data-lineage-node-key="${CSS.escape(edge.to)}"]`);
        if (!from || !to) continue;
        const a = from.getBoundingClientRect();
        const b = to.getBoundingClientRect();
        const x1 = a.left - innerRect.left + a.width / 2;
        const y1 = a.bottom - innerRect.top;
        const x2 = b.left - innerRect.left + b.width / 2;
        const y2 = b.top - innerRect.top;
        const mid = y1 + Math.max(14, (y2 - y1) * 0.5);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`);
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.appendChild(path);
      }

      if (!centered && inner.scrollWidth > viewport.clientWidth) {
        viewport.scrollLeft = Math.max(0, (inner.scrollWidth - viewport.clientWidth) / 2);
        centered = true;
      }
    };

    const scheduleDraw = () => requestAnimationFrame(draw);
    lineageCard.addEventListener('toggle', () => {
      if (lineageCard.open) scheduleDraw();
    });
    window.addEventListener('resize', scheduleDraw, { passive: true });
    if (lineageCard.open) scheduleDraw();

    root.dataset.lineageMapV1 = 'ready';
    window.__CSWLineageMapV1 = {
      status: 'PASS',
      contract: LINEAGE_MAP_CONTRACT,
      cultivarId: id,
      directParents: confirmedLineageParents(cultivar).length,
      nodeCount: section.querySelectorAll('.csw-lineage-map-node').length,
      upstreamLabelCount: section.querySelectorAll('.csw-lineage-map-upstream').length,
      upstreamLabels: [...section.querySelectorAll('.csw-lineage-map-upstream')].map(label => ({
        parent: label.dataset.lineageUpstreamFor || '',
        label: label.textContent.trim()
      })),
      maxDepth: LINEAGE_MAP_MAX_DEPTH
    };
    return true;
  };

  const decorateDoSiDosUpstreamRail = ({ id, cultivar, root, lineageCard }) => {
    if (id !== 'do-si-dos') return false;
    const body = lineageCard.querySelector(':scope > div');
    if (!body) return false;

    const integrated = body.querySelector(':scope > [data-sitewide-lineage-integrated="v1"]');
    if (!integrated) throw new Error('DO_SI_DOS_RELATIONSHIP_RAIL_MISSING');
    if (integrated.dataset.doSiDosUpstreamRail === 'v1') {
      root.dataset.doSiDosUpstreamRail = 'ready';
      return true;
    }

    const parents = confirmedLineageParents(cultivar);
    const items = parents.map(parent => ({
      parent,
      context: lineageUpstreamLabel(id, parent)
    })).filter(item => item.context);
    if (items.length !== parents.length || items.length !== 2) {
      throw new Error(`DO_SI_DOS_UPSTREAM_RAIL_INCOMPLETE:${items.length}/${parents.length}`);
    }

    const prose = body.querySelector(':scope > p');
    if (!prose) throw new Error('DO_SI_DOS_LINEAGE_PROSE_MISSING');
    prose.textContent = 'OGKBはCookies / GSC側の系統、Face Off OG BX1はOG側のbreeding lineとして上流につながります。CSWではOGKBをGirl Scout Cookiesへ、Face Off OG BX1をOG Kushへ置き換えず、確認されたdirect parent名をそのまま保持しています。';

    const fragment = document.createDocumentFragment();
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'csw-name-rel-rail-item';
      row.dataset.upstreamFamilyContext = item.parent;
      row.dataset.lineageContextKind = 'family-side';

      const block = document.createElement('div');
      block.className = 'csw-name-rel-name-block';

      const title = document.createElement('strong');
      title.className = 'csw-name-rel-name';
      title.textContent = item.context;

      const relationToParent = document.createElement('p');
      relationToParent.className = 'csw-name-rel-lineage';
      relationToParent.textContent = `${item.parent}側の上流文脈`;

      const relation = document.createElement('div');
      relation.className = 'csw-name-rel-relation';
      relation.appendChild(makeRelationshipLabel('系統背景', 'FAMILY SIDE'));

      block.append(title, relationToParent, relation);
      row.append(makeTrack({ node: true }), block);
      fragment.appendChild(row);
    });

    const aliasRow = integrated.querySelector(':scope > .csw-name-rel-alias-row');
    if (aliasRow) aliasRow.classList.remove('is-standalone');
    integrated.insertBefore(fragment, integrated.firstChild);
    integrated.dataset.doSiDosUpstreamRail = 'v1';

    const evidence = body.querySelector(':scope > .ucd-evidence-row') || lineageCard.querySelector('.ucd-evidence-row');
    root.dataset.doSiDosUpstreamRail = 'ready';
    window.__CSWDoSiDosUpstreamRailV1 = {
      status: 'PASS',
      cultivarId: id,
      directLineage: text(cultivar?.lineage?.display),
      items,
      presentation: 'sitewide-relationship-rail',
      mapRendered: false,
      duplicateParentSummary: false,
      evidencePreserved: Boolean(evidence)
    };
    return true;
  };

  const decorateUniversal = ({ id, catalog, cultivar, root, lineageCard }) => {
    setIntegratedTitle(lineageCard);
    const body = lineageCard.querySelector(':scope > div');
    if (!body) return false;

    let integrated = body.querySelector(':scope > [data-sitewide-lineage-integrated="v1"]');
    const aliases = unique(cultivar.aliases).filter(alias => alias !== cultivar.name);
    const childLines = resolveChildLines(catalog, cultivar);
    const selectionLines = resolveSelectionLines(catalog, cultivar);
    const typedRows = [
      ...childLines.map(line => ({ type: 'child-line', line })),
      ...selectionLines.map(line => ({ type: 'selection', line }))
    ];
    if (!integrated && (aliases.length || typedRows.length)) {
      integrated = document.createElement('section');
      integrated.className = 'csw-name-rel-integrated csw-name-rel-integrated-sitewide';
      integrated.dataset.sitewideLineageIntegrated = 'v1';
      const aliasRow = makeAliasRow(aliases, { standalone: typedRows.length === 0 });
      if (aliasRow) integrated.appendChild(aliasRow);
      typedRows.forEach((item, index) => {
        const row = document.createElement('div');
        row.className = 'csw-name-rel-rail-item';
        if (item.type === 'child-line') {
          row.dataset.childRelationship = item.line.id;
          row.append(makeTrack({ node: true, last: index === typedRows.length - 1 }), makeChildBlock(item.line));
        } else {
          row.dataset.selectionRelationship = item.line.id;
          row.append(makeTrack({ node: true, last: index === typedRows.length - 1 }), makeSelectionBlock(item.line));
        }
        integrated.appendChild(row);
      });
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
      aliases, aliasCount: aliases.length,
      childLines: childLines.map(line => ({ id: line.id, name: line.name, lineage: line.lineage })),
      childCount: childLines.length,
      selectionLines: selectionLines.map(line => ({ id: line.id, name: line.name, relationshipDisplay: line.relationshipDisplay })),
      selectionCount: selectionLines.length,
      evidenceFooterAtBottom
    };
    return true;
  };

  const decorate = async () => {
    const state = await resolveCurrent();
    if (!state) return false;
    const relationshipsReady = state.id === RAINBOW_ID ? decorateRainbow(state) : decorateUniversal(state);
    if (state.id === 'do-si-dos') decorateDoSiDosUpstreamRail(state);
    else decorateLineageMap(state);
    return relationshipsReady;
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
            .csw-lineage-map-v1{margin:2px 0 14px;padding:2px 0 13px;border-bottom:1px solid rgba(216,189,98,.13)}
      .csw-lineage-map-heading{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:0 2px 10px}
      .csw-lineage-map-heading span{color:#d8bd62;font-size:10px;font-weight:900;letter-spacing:.09em}
      .csw-lineage-map-heading small{color:#8f9d95;font-size:9px;font-weight:700;white-space:nowrap}
      .csw-lineage-map-viewport{max-width:100%;overflow-x:auto;overflow-y:hidden;padding:8px 10px 12px;border:1px solid rgba(217,182,93,.12);border-radius:14px;background:linear-gradient(180deg,rgba(217,182,93,.035),rgba(255,255,255,.018));scrollbar-width:thin;overscroll-behavior-inline:contain;-webkit-overflow-scrolling:touch}
      .csw-lineage-map-inner{position:relative;display:inline-block;min-width:100%;padding:10px 14px 8px}
      .csw-lineage-map-tree{position:relative;z-index:2;display:flex;justify-content:center;min-width:max-content}
      .csw-lineage-map-branch{display:flex;flex:0 0 auto;flex-direction:column;align-items:center;justify-content:flex-end;gap:24px;min-width:134px;padding:0 5px}
      .csw-lineage-map-parents{display:flex;align-items:flex-end;justify-content:center;gap:8px}
      .csw-lineage-map-node-stack{display:flex;flex-direction:column;align-items:center;gap:8px}
      .csw-lineage-map-upstream{position:relative;z-index:2;display:flex;align-items:center;justify-content:center;min-height:24px;max-width:112px;padding:4px 8px;border:1px solid rgba(216,189,98,.18);border-radius:999px;background:rgba(216,189,98,.045);color:#9daa9f;font-size:8.5px;font-weight:760;line-height:1.25;text-align:center;white-space:nowrap}
      .csw-lineage-map-upstream:after{content:'';position:absolute;left:50%;top:100%;height:8px;border-left:1px dashed rgba(216,189,98,.38);transform:translateX(-.5px)}
      .csw-lineage-map-node{position:relative;z-index:2;display:flex;width:124px;min-height:52px;padding:9px 8px 7px;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#0a1711;color:#edf1e9;text-align:center;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.16)}
      .csw-lineage-map-node strong{display:block;max-width:100%;font-size:11.5px;line-height:1.28;overflow-wrap:anywhere}
      .csw-lineage-map-node small{color:#86978d;font-size:7px;font-weight:850;letter-spacing:.12em}
      .csw-lineage-map-node.is-root{border-color:rgba(217,182,93,.62);background:linear-gradient(145deg,rgba(217,182,93,.17),rgba(35,74,48,.34));color:#fff8df;box-shadow:0 10px 28px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.045)}
      .csw-lineage-map-node.is-root small{color:#d8bd62}
      .csw-lineage-map-node.is-linked{border-color:rgba(105,169,120,.32);background:linear-gradient(145deg,rgba(105,169,120,.09),rgba(255,255,255,.02))}
      .csw-lineage-map-node.is-linked small{color:#92b79a}
      .csw-lineage-map-edges{position:absolute;inset:0;z-index:1;overflow:visible;pointer-events:none}
      .csw-lineage-map-edges path{fill:none;stroke:rgba(217,182,93,.48);stroke-width:1.35;stroke-linecap:round}
      .csw-lineage-map-note{margin:9px 2px 0!important;color:#8f9d95!important;font-size:10px!important;line-height:1.55!important}
      @media(max-width:390px){
        .csw-lineage-map-heading{align-items:flex-start;flex-direction:column;gap:3px}
        .csw-lineage-map-heading span{font-size:10.5px}
        .csw-lineage-map-heading small{font-size:9.5px}
        .csw-lineage-map-viewport{padding:7px 6px 11px}
        .csw-lineage-map-inner{padding-inline:10px}
        .csw-lineage-map-branch{min-width:126px;padding-inline:4px}
        .csw-lineage-map-upstream{max-width:108px;min-height:23px;padding:3px 7px;font-size:8.25px}
        .csw-lineage-map-node{width:116px;min-height:50px;padding:8px 7px 6px}
        .csw-lineage-map-node strong{font-size:11px}
        .csw-lineage-map-note{font-size:10.5px!important}
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
