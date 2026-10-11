(() => {
  'use strict';

  const CONTRACT = 'CSW_FAMILY_TREE_VIEW_V1';
  const STATE_KEY = '__cswFamilyTreeV1';
  const NAV_KEY = '__cswFamilyTreeFrom';
  const MAX_DEPTH = 2;
  const BRANCH_LIMIT = 4; // Aggregate initial budget. Direct contributors uncapped.
  const HOME_FAMILY_ANCHORS = Object.freeze([
    { id: 'og-kush', label: 'OG Kush系', note: 'OG Kushを起点' },
    { id: 'girl-scout-cookies', label: 'Cookies / GSC系', note: 'Girl Scout Cookiesを起点' },
    { id: 'gelato-33', label: 'Gelato系', note: 'Gelato #33を起点' },
    { id: 'sunset-sherbert', label: 'Sherbert系', note: 'Sunset Sherbertを起点' },
    { id: 'skunk-1', label: 'Skunk #1系', note: 'Skunk #1を起点' },
    { id: 'a5-haze', label: 'A5 Haze系', note: 'A5 Hazeを起点' }
  ]);
  const shell = document.getElementById('detail-shell');
  if (!shell) return;

  const text = value => typeof value === 'string' ? value.trim() : '';
  const unique = values => [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
  const normalize = value => String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  const currentId = () => new URL(location.href).searchParams.get('strain');
  const currentRoot = id => shell.querySelector('.detail-public-v1[data-public-detail-id="' + CSS.escape(id) + '"],.ucd-root[data-public-detail-id="' + CSS.escape(id) + '"]');

  const TYPED_RELATION_RULES = new Map([
    ['girl scout cookies>ogkb', { type: 'selected-cut', label: 'selected cut', guard: /clone-only cut/i }],
    ['girl scout cookies>forum-gsc', { type: 'selected-cut', label: 'selected cut', guard: /selected GSC cut|Forum cut/i }],
    ['girl scout cookies>thin-mint-gsc', { type: 'selected-cut', label: 'selected cut', guard: /sub-type|選抜ノード/i }],
    ['og kush>the-og-18', { type: 'selection', label: 'selected line', guard: /S1|選抜|再フェミナイズ/i }],
    ['og kush>ghost-og', { type: 'selected-cut', label: 'selected cut', guard: /clone-only cut/i }],
    ['og kush>sfv-og', { type: 'selected-cut', label: 'selected cut', guard: /clone selection/i }],
    ['og kush>tahoe-og', { type: 'selected-cut', label: 'selected cut', guard: /clone selection/i }],
    ['face off og>face-off-og-bx1', { type: 'bx', label: 'BX', guard: /backcross family/i }],
    ['gelato 33>lemon-cherry-gelato', { type: 'other', label: 'bagseed', guard: /bagseed/i }]
  ]);

  const PUBLIC_RELATION_LABELS = new Map([
    ['parent', '親'],
    ['selected cut', '選抜クローン'],
    ['selected phenotype', '選抜個体'],
    ['selected line', '選抜系統'],
    ['S1', 'S1'],
    ['BX', 'BX'],
    ['bagseed', 'バッグシード']
  ]);
  const publicRelationLabel = relation => PUBLIC_RELATION_LABELS.get(text(relation?.label)) || text(relation?.label);

  let catalogPromise;
  const loadCatalog = () => {
    if (window.__CSWRuntimeCatalogPromise && typeof window.__CSWRuntimeCatalogPromise.then === 'function') {
      return Promise.resolve(window.__CSWRuntimeCatalogPromise);
    }
    catalogPromise ||= fetch('runtime/catalog.json', { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error('catalog HTTP ' + response.status);
      return response.json();
    });
    return catalogPromise;
  };

  const buildResolver = catalog => {
    const index = new Map();
    for (const item of catalog?.cultivars || []) {
      for (const raw of [item?.id, item?.name, ...(item?.aliases || [])]) {
        const key = normalize(raw);
        if (!key) continue;
        const bucket = index.get(key) || [];
        if (!bucket.some(candidate => candidate.id === item.id)) bucket.push(item);
        index.set(key, bucket);
      }
    }
    return label => {
      const matches = index.get(normalize(label)) || [];
      return matches.length === 1 ? matches[0] : null;
    };
  };

  const confirmedParents = cultivar => {
    const lineage = cultivar?.lineage;
    if (!lineage || text(lineage.status) !== 'confirmed') return [];
    return unique(lineage.parents || []);
  };

  const validateTypedRelations = catalog => {
    const byId = new Map((catalog?.cultivars || []).map(item => [text(item?.id), item]));
    for (const [key, rule] of TYPED_RELATION_RULES) {
      const splitAt = key.lastIndexOf('>');
      const parentKey = key.slice(0, splitAt);
      const childId = key.slice(splitAt + 1);
      const child = byId.get(childId);
      if (!child) continue;
      const parents = confirmedParents(child);
      const parentKeys = parents.map(normalize);
      const lineageText = text(child?.lineage?.presentation?.textJa);
      if ((rule.type === 'selected-phenotype' || rule.type === 'selected-line') && parents.length > 1) {
        throw new Error('FAMILY_TREE_MULTI_PARENT_SELECTION_EDGE_FORBIDDEN:' + key);
      }
      if (!parentKeys.includes(parentKey) || !rule.guard.test(lineageText)) {
        throw new Error('FAMILY_TREE_TYPED_RELATION_GUARD_FAILED:' + key);
      }
    }
  };

  const selectionRelationship = (parent, childId) => {
    const selections = parent?.publicPresentation?.nameRelationships?.selections;
    if (!Array.isArray(selections)) return false;
    return selections.some(line => text(line?.id) === childId && text(line?.relationshipType) === 'selection');
  };

  const relationFor = (parentLabel, parentCultivar, childCultivar) => {
    const typed = TYPED_RELATION_RULES.get(normalize(parentLabel) + '>' + text(childCultivar?.id));
    if (typed) return { type: typed.type, label: typed.label };
    if (parentCultivar && selectionRelationship(parentCultivar, childCultivar?.id) && confirmedParents(childCultivar).length === 1) {
      return { type: 'selection', label: 'selected line' };
    }
    if (text(childCultivar?.breeding?.generation).toUpperCase() === 'S1' && confirmedParents(childCultivar).length === 1) {
      return { type: 's1', label: 'S1' };
    }
    return { type: 'parent', label: 'parent' };
  };

  const nodeKey = (label, cultivar) => cultivar?.id ? 'p:' + cultivar.id : 'u:' + normalize(label);
  const visualFor = cultivar => (cultivar?.visuals || []).find(visual => visual?.role === 'primary') || (cultivar?.visuals || [])[0] || null;

  const buildGraph = (catalog, center) => {
    validateTypedRelations(catalog);
    const resolve = buildResolver(catalog);
    const nodes = new Map();
    const edges = new Map();
    let order = 0;

    const addNode = (label, cultivar, depth, occurrencePath = '') => {
      // An occurrence belongs to a path through this view. Canonical identity
      // remains node.id; layout identity is node.key. Neither is evidence.
      const canonicalKey = nodeKey(label, cultivar);
      const key = depth === 0 ? canonicalKey : canonicalKey + '@' + occurrencePath;
      const existing = nodes.get(key);
      if (existing) {
        if (Math.abs(depth) < Math.abs(existing.depth)) existing.depth = depth;
        return existing;
      }
      const node = {
        key,
        id: cultivar?.id || '',
        label: text(cultivar?.name) || text(label) || 'Unknown',
        cultivar: cultivar || null,
        published: Boolean(cultivar?.id),
        depth,
        order: order++
      };
      nodes.set(key, node);
      return node;
    };

    const addEdge = (from, to, relation) => {
      const key = from.key + '>' + to.key + '>' + relation.type;
      if (!edges.has(key)) edges.set(key, { key, from: from.key, to: to.key, relation });
    };

    const centerNode = addNode(center.name, center, 0);

    let upstreamFrontier = [{ item: center, node: centerNode, distance: 0 }];
    for (let step = 0; step < MAX_DEPTH; step += 1) {
      const next = [];
      for (const entry of upstreamFrontier) {
        for (const parentLabel of confirmedParents(entry.item)) {
          const parentCultivar = resolve(parentLabel);
          const parentNode = addNode(parentLabel, parentCultivar, -(entry.distance + 1), 'up:' + entry.node.key);
          addEdge(parentNode, entry.node, relationFor(parentLabel, parentCultivar, entry.item));
          if (parentCultivar) next.push({ item: parentCultivar, node: parentNode, distance: entry.distance + 1 });
        }
      }
      upstreamFrontier = next;
    }

    const childIndex = new Map();
    for (const child of catalog?.cultivars || []) {
      if (text(child?.lineage?.status) !== 'confirmed') continue;
      for (const parentLabel of unique(child?.lineage?.parents || [])) {
        const parent = resolve(parentLabel);
        if (!parent?.id) continue;
        const list = childIndex.get(parent.id) || [];
        if (!list.some(entry => entry.child.id === child.id && entry.parentLabel === parentLabel)) {
          list.push({ child, parentLabel });
        }
        childIndex.set(parent.id, list);
      }
    }

    let downstreamFrontier = [{ item: center, node: centerNode, distance: 0 }];
    for (let step = 0; step < MAX_DEPTH; step += 1) {
      const next = [];
      for (const entry of downstreamFrontier) {
        const children = (childIndex.get(entry.item.id) || [])
          .map(childEntry => ({
            ...childEntry,
            relation: relationFor(childEntry.parentLabel, entry.item, childEntry.child)
          }))
          .sort((a, b) => {
            const priority = relation => relation.type === 'selected-cut' ? 2 : relation.type === 'parent' ? 1 : 0;
            return priority(a.relation) - priority(b.relation) || String(a.child.name).localeCompare(String(b.child.name), 'en');
          });
        for (const childEntry of children) {
          const childNode = addNode(childEntry.child.name, childEntry.child, entry.distance + 1, 'down:' + entry.node.key);
          addEdge(entry.node, childNode, childEntry.relation);
          next.push({ item: childEntry.child, node: childNode, distance: entry.distance + 1 });
        }
      }
      downstreamFrontier = next;
    }

    return { centerKey: centerNode.key, nodes, edges: [...edges.values()] };
  };

  // B3a only: initial display budget; never create or reclassify a formal edge.
  const visibleGraph = (graph, expanded) => {
    const incoming = new Map(), outgoing = new Map();
    for (const edge of graph.edges) {
      const parents = incoming.get(edge.to) || [];
      parents.push(edge); incoming.set(edge.to,parents);
      const children = outgoing.get(edge.from) || [];
      children.push(edge); outgoing.set(edge.from,children);
    }
    const ordered = edges => (edges || []).slice().sort((a,b) => {
      const left=graph.nodes.get(a.from===b.from?a.to:a.from);
      const right=graph.nodes.get(a.from===b.from?b.to:b.from);
      return (left?.order??0)-(right?.order??0) ||
        String(left?.id||left?.key||'').localeCompare(String(right?.id||right?.key||''),'en');
    });
    const visibleKeys=new Set([graph.centerKey]), selectedEdges=[];
    const hiddenCounts=new Map(), expandableCounts=new Map();
    const add=(edge,end)=>{visibleKeys.add(edge[end]);selectedEdges.push(edge);};

    // Use a global four-slot initial budget, interleaved across branches.
    // A branch's explicit expansion adds the remainder of that branch alone.
    const allocate = (groups,limit=BRANCH_LIMIT) => {
      const chosen=new Map(groups.map(g=>[g.token,[]]));
      let taken=0,round=0;
      while(taken<limit){
        let advanced=false;
        for(const group of groups){
          if(taken===limit)break;
          if(round<group.edges.length){
            chosen.get(group.token).push(group.edges[round]);
            taken++;advanced=true;
          }
        }
        if(!advanced)break;
        round++;
      }
      for(const group of groups){
        const initial=chosen.get(group.token);
        if(initial.length<group.edges.length)expandableCounts.set(group.token,group.edges.length);
        const shown=expanded.has(group.token)?group.edges:initial;
        if(shown.length<group.edges.length)hiddenCounts.set(group.token,group.edges.length-shown.length);
        chosen.set(group.token,shown);
      }
      return chosen;
    };

    // All direct parent/contributor nodes are initially visible, irrespective
    // of cardinality; preserve the source-derived relations as they already are.
    const direct=ordered(incoming.get(graph.centerKey));
    for(const edge of direct)add(edge,'from');

    // Grandparents: a single initial four-slot quota across all parent branches.
    const grandparentGroups=direct.map(edge=>({
      token:'up:'+edge.from,edges:ordered(incoming.get(edge.from))
    }));
    const chosenGrandparents=allocate(grandparentGroups);
    for(const group of grandparentGroups)
      for(const edge of chosenGrandparents.get(group.token))add(edge,'from');

    // Descendants at +1: globally four slots, diversified across existing
    // relation labels for presentation only. This does NOT admit source evidence.
    const children=ordered(outgoing.get(graph.centerKey));
    const byType=new Map();
    for(const edge of children){
      const type=String(edge.relation?.type||'unclassified');
      if(!byType.has(type))byType.set(type,[]);
      byType.get(type).push(edge);
    }
    const centerToken='down:'+graph.centerKey;
    const groups=[...byType.entries()].map(([type,edges])=>({
      token:centerToken+':group:'+type,edges
    }));
    const choices=allocate(groups);
    const initialKeys=new Set([...choices.values()].flat().map(e=>e.key));
    const initialChildren=children.filter(e=>initialKeys.has(e.key));
    // Temporary group tokens are presentation implementation details.
    for(const group of groups){
      hiddenCounts.delete(group.token);expandableCounts.delete(group.token);
    }
    if(initialChildren.length<children.length)expandableCounts.set(centerToken,children.length);
    const shownChildren=expanded.has(centerToken)?children:initialChildren;
    if(shownChildren.length<children.length)
      hiddenCounts.set(centerToken,children.length-shownChildren.length);
    for(const edge of shownChildren)add(edge,'to');

    // Grandchildren: again one global four-slot quota, fairly split across
    // visible first-generation branches. No 3rd-generation auto-expansion.
    const grandchildGroups=shownChildren.map(edge=>({
      token:'down:'+edge.to,edges:ordered(outgoing.get(edge.to))
    }));
    const chosenGrandchildren=allocate(grandchildGroups);
    for(const group of grandchildGroups)
      for(const edge of chosenGrandchildren.get(group.token))add(edge,'to');

    return {
      nodes:[...visibleKeys].map(key=>graph.nodes.get(key)).filter(Boolean),
      edges:[...new Map(selectedEdges.map(edge=>[edge.key,edge])).values()],
      hiddenCounts,expandableCounts
    };
  };

  let overlay;
  // Evidence controls consume only the authorized staged payload. No legacy fallback.
  let evidenceClaim = null;
  let evidenceSheet = null;
  let evidenceFocus = null;
  const approvedEvidenceClaim = center => {
    if (center?.id !== 'do-si-dos') return null;
    const data = center.publicPresentation?.lineageExplorerV1;
    if (data?.schemaVersion !== 1 || data.claims?.length !== 1 || data.edges?.length !== 2) return null;
    const claim = data.claims[0], source = claim.sources?.[0];
    if (claim.id !== 'csw-lineage-claim-do-si-dos-direct-parents-v1' || claim.kind !== 'direct-parent-set' || claim.status !== 'confirmed' || claim.confidence !== 'A' || claim.evidenceLabel !== '一次情報' || claim.summaryJa !== 'Do-Si-Dosの直接親はOGKBとFace Off OG BX1。' || claim.sources.length !== 1) return null;
    if (source?.id !== 'csw-lineage-source-archive-do-si-dos-v1' || source.publisher !== 'Archive Seed Bank' || source.title !== 'Do-Si-Dos' || source.evidenceLabel !== '一次情報' || source.url !== 'https://archiveseedbank.com/products/do-si-dos') return null;
    const parents = [['ogkb', 'OGKB'], ['face-off-og-bx1', 'Face Off OG BX1']];
    if (claim.contributors?.length !== 2 || !parents.every(([id, name], i) => claim.contributors[i]?.cultivarId === id && claim.contributors[i]?.name === name && data.edges[i]?.id === 'csw-lineage-edge-' + id + '-do-si-dos-v1' && data.edges[i]?.fromCultivarId === id && data.edges[i]?.toCultivarId === center.id && data.edges[i]?.relationKind === 'direct-parent' && data.edges[i]?.claimId === claim.id && data.edges[i]?.contributorIndex === i)) return null;
    return claim;
  };
  // B5 presentation model: only the existing exact approved claim is admitted.
  // Rendered fields are copied explicitly; PRIVATE or legacy fields never flow through.
  const evidenceSheetModel = center => {
    const claim = approvedEvidenceClaim(center);
    if (!claim) return null;
    return {
      title: 'Do-Si-Dos',
      claims: [{
        id: claim.id,
        summaryJa: claim.summaryJa,
        evidenceLabel: claim.evidenceLabel,
        sources: claim.sources.map(source => ({
          publisher: source.publisher,
          title: source.title,
          evidenceLabel: source.evidenceLabel,
          url: source.url
        }))
      }]
    };
  };

  // PRIVATE B6 UI only: exact owner-approved public output, never legacy inference.
  const b6Stable = v => Array.isArray(v) ? v.map(b6Stable) : v && typeof v === 'object' ?
    Object.fromEntries(Object.keys(v).sort().map(k => [k,b6Stable(v[k])])) : v;
  const B6_EXACT = "{\"claims\":[{\"confidence\":\"A\",\"contributors\":[{\"cultivarId\":\"ogkb\",\"name\":\"OGKB\"},{\"cultivarId\":\"face-off-og-bx1\",\"name\":\"Face Off OG BX1\"}],\"evidenceLabel\":\"一次情報\",\"id\":\"csw-lineage-claim-do-si-dos-direct-parents-v1\",\"kind\":\"direct-parent-set\",\"sources\":[{\"evidenceLabel\":\"一次情報\",\"id\":\"csw-lineage-source-archive-do-si-dos-v1\",\"publisher\":\"Archive Seed Bank\",\"title\":\"Do-Si-Dos\",\"url\":\"https://archiveseedbank.com/products/do-si-dos\"}],\"status\":\"confirmed\",\"summaryJa\":\"Do-Si-Dosの直接親はOGKBとFace Off OG BX1。\"}],\"edges\":[{\"claimId\":\"csw-lineage-claim-do-si-dos-direct-parents-v1\",\"contributorIndex\":0,\"fromCultivarId\":\"ogkb\",\"id\":\"csw-lineage-edge-ogkb-do-si-dos-v1\",\"relationKind\":\"direct-parent\",\"toCultivarId\":\"do-si-dos\"},{\"claimId\":\"csw-lineage-claim-do-si-dos-direct-parents-v1\",\"contributorIndex\":1,\"fromCultivarId\":\"face-off-og-bx1\",\"id\":\"csw-lineage-edge-face-off-og-bx1-do-si-dos-v1\",\"relationKind\":\"direct-parent\",\"toCultivarId\":\"do-si-dos\"}],\"schemaVersion\":1}";
  const B6_DIRECT = [["ogkb","do-si-dos"],["face-off-og-bx1","do-si-dos"]];
  const b6IsApproved = cultivar => cultivar?.id === 'do-si-dos' &&
    !!approvedEvidenceClaim(cultivar) &&
    JSON.stringify(b6Stable(cultivar.publicPresentation?.lineageExplorerV1)) === B6_EXACT;
  const b6AdmittedEdge = (edge, graph) => {
    const from=graph?.nodes?.get(edge?.from), to=graph?.nodes?.get(edge?.to);
    return !!from?.published && !!to?.published &&
      from.depth+1===to.depth && edge.relation?.type==='parent' &&
      b6IsApproved(to.cultivar) && B6_DIRECT.some(([a,b]) => from.id===a && to.id===b);
  };
  const b6NodeState = node => !node?.published || !node.id ? 'IDENTITY_UNRESOLVED' :
    node.cultivar?.lineage?.status === 'unknown' ? 'UNKNOWN' :
    node.cultivar?.lineage?.status === 'disputed' ? 'DISPUTED' : 'IDENTITY_ONLY';
  // B11 PRIVATE view-only: unmatched public-catalog labels do not confer identity.
  const b11PublicNameCandidates = new Map();
  const b11RecordCandidates = catalog => {
    b11PublicNameCandidates.clear();
    for (const item of catalog?.cultivars || []) {
      if (!item?.id) continue;
      for (const raw of [item.id, item.name, ...(item.aliases || [])]) {
        const key = normalize(raw);
        if (!key) continue;
        const matches = b11PublicNameCandidates.get(key) || new Set();
        matches.add(item.id);
        b11PublicNameCandidates.set(key,matches);
      }
    }
  };
  const b11NodeBoundary = node => {
    if (node?.published) return b6NodeState(node);
    const count = b11PublicNameCandidates.get(normalize(node?.label))?.size || 0;
    return count > 1 ? 'AMBIGUOUS_PUBLIC_IDENTITY' :
      count === 0 ? 'NOT_IN_PUBLIC_CATALOG' : 'IDENTITY_UNRESOLVED';
  };
  const b11UnresolvedNote = node => {
    const boundary = b11NodeBoundary(node);
    return boundary === 'AMBIGUOUS_PUBLIC_IDENTITY' ? '同名候補複数・同一性未確定' :
      boundary === 'NOT_IN_PUBLIC_CATALOG' ? '図鑑未掲載・同一性未照合' : '同一性未確認';
  };

  // B13 counts rendered items, never evidence or source authority.
  const b13ViewSummary = (view, graph) => {
    const admitted = view.edges.filter(edge => b6AdmittedEdge(edge,graph)).length;
    const held = view.edges.length - admitted;
    const counts = {UNKNOWN:0,DISPUTED:0,NOT_IN_PUBLIC_CATALOG:0,AMBIGUOUS_PUBLIC_IDENTITY:0,IDENTITY_UNRESOLVED:0};
    for (const node of view.nodes) {
      const boundary = b11NodeBoundary(node);
      if (Object.prototype.hasOwnProperty.call(counts,boundary)) counts[boundary]++;
    }
    const hidden = [...view.hiddenCounts.values()].reduce((n,k)=>n+k,0);
    const parts=[];
    if (!view.edges.length) parts.push(direction === 'descendants' ? '図鑑に登録された子・派生関係はまだありません' : 'この範囲に表示できる関係線はありません');
    else parts.push('根拠確認済み '+admitted+'件 ／ 掲載情報のみ '+held+'件');
    if (counts.UNKNOWN) parts.push('関係情報未確認 '+counts.UNKNOWN+'件');
    if (counts.DISPUTED) parts.push('異説あり '+counts.DISPUTED+'件');
    if (counts.NOT_IN_PUBLIC_CATALOG) parts.push('図鑑未掲載 '+counts.NOT_IN_PUBLIC_CATALOG+'件');
    if (counts.AMBIGUOUS_PUBLIC_IDENTITY) parts.push('同名候補複数 '+counts.AMBIGUOUS_PUBLIC_IDENTITY+'件');
    if (counts.IDENTITY_UNRESOLVED) parts.push('同一性未確認 '+counts.IDENTITY_UNRESOLVED+'件');
    if (hidden) parts.push('表示枠で省略 '+hidden+'件（枝を展開可能）');
    return {admitted,held,counts,hidden,text:parts.join('｜')};
  };
  const renderEvidenceClaims = (container, model) => {
    container.replaceChildren();
    for (const claim of model.claims) {
      const article = document.createElement('article');
      article.dataset.ftEvidenceGroup = claim.id;
      const summary = document.createElement('p');
      summary.className = 'csw-ft-evidence-summary';
      summary.textContent = claim.summaryJa;
      const label = document.createElement('p');
      label.className = 'csw-ft-evidence-label';
      label.textContent = '出典の種類：' + claim.evidenceLabel;
      article.append(summary, label);
      for (const source of claim.sources) {
        const group = document.createElement('section');
        const publisher = document.createElement('p');
        publisher.className = 'csw-ft-evidence-publisher';
        publisher.textContent = '育種元公式：' + source.publisher;
        const link = document.createElement('a');
        link.className = 'csw-ft-evidence-source';
        link.textContent = '公式出典を見る';
        link.href = source.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        const details = document.createElement('details');
        details.className = 'csw-ft-evidence-details';
        const toggle = document.createElement('summary');
        toggle.textContent = '出典の詳細';
        const title = document.createElement('p');
        title.textContent = source.title;
        const sourceLabel = document.createElement('p');
        sourceLabel.textContent = source.evidenceLabel;
        details.append(toggle, title, sourceLabel);
        group.append(publisher, link, details);
        article.appendChild(group);
      }
      container.appendChild(article);
    }
  };
  const closeEvidence = () => {
    if (!evidenceSheet?.open) return;
    evidenceSheet.close();
    if (evidenceFocus?.isConnected && overlay?.open) evidenceFocus.focus({ preventScroll: true });
  };
  const openEvidence = trigger => {
    if (!evidenceClaim || !overlay?.open) return;
    const center = graphState?.nodes.get(graphState.centerKey)?.cultivar;
    const model = evidenceSheetModel(center);
    if (!model) return;
    if (!evidenceSheet) {
      evidenceSheet = document.createElement('dialog');
      evidenceSheet.className = 'csw-ft-evidence-sheet';
      evidenceSheet.setAttribute('aria-label', 'Do-Si-Dosの直接親の根拠');
      evidenceSheet.innerHTML = '<button type="button" class="csw-ft-evidence-close" aria-label="根拠カードを閉じる">閉じる</button><h2></h2><div class="csw-ft-evidence-claims"></div>';
      document.body.appendChild(evidenceSheet);
      evidenceSheet.querySelector('button').addEventListener('click', closeEvidence);
      evidenceSheet.addEventListener('cancel', event => { event.preventDefault(); event.stopPropagation(); closeEvidence(); });
      evidenceSheet.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeEvidence(); }
      });
    }
    evidenceFocus = trigger;
    evidenceSheet.querySelector('h2').textContent = model.title;
    renderEvidenceClaims(evidenceSheet.querySelector('.csw-ft-evidence-claims'), model);
    if (!evidenceSheet.open) evidenceSheet.showModal();
    evidenceSheet.querySelector('button').focus({ preventScroll: true });
  };

  let viewport;
  let stage;
  let syncWorldSize=()=>{};
  let graphState = null;
  let direction = 'all'; // all | ancestors | descendants; UI state, not lineage evidence.
  let expanded = new Set();
  let centerId = '';
  let restoreScroll = null;
  let centerOnNextRender = false;
  let lastFocus = null;
  let familyExplorer;
  let familyExplorerCatalog = null;
  let familyExplorerAnchorId = '';
  let familyTreeReturnAnchorId = '';
  let centerSwitchPending = false;
  let exitToOriginPending = false;
  let exitReturnAnchorId = '';
  let searchGeneration = 0;

  const familyMembers = (catalog, anchorId) => {
    const anchor = (catalog?.cultivars || []).find(item => item?.id === anchorId);
    if (!anchor) return [];
    const resolve = buildResolver(catalog);
    const childIndex = new Map();
    for (const child of catalog?.cultivars || []) {
      if (text(child?.lineage?.status) !== 'confirmed') continue;
      for (const parentLabel of confirmedParents(child)) {
        const parent = resolve(parentLabel);
        if (!parent?.id) continue;
        const list = childIndex.get(parent.id) || [];
        if (!list.some(item => item.id === child.id)) list.push(child);
        childIndex.set(parent.id, list);
      }
    }
    const distance = new Map([[anchor.id, 0]]);
    const queue = [anchor.id];
    while (queue.length) {
      const id = queue.shift();
      const nextDistance = (distance.get(id) || 0) + 1;
      for (const child of childIndex.get(id) || []) {
        if (distance.has(child.id)) continue;
        distance.set(child.id, nextDistance);
        queue.push(child.id);
      }
    }
    return [...distance.entries()]
      .map(([id, depth]) => ({ cultivar: (catalog?.cultivars || []).find(item => item?.id === id), depth }))
      .filter(item => item.cultivar)
      .sort((a, b) => a.depth - b.depth || String(a.cultivar.name).localeCompare(String(b.cultivar.name), 'en'));
  };

  const familyAnchor = id => HOME_FAMILY_ANCHORS.find(item => item.id === id) || null;

  const renderFamilyExplorer = () => {
    if (!familyExplorer || !familyExplorerCatalog) return;
    const body = familyExplorer.querySelector('.csw-fx-body');
    const title = familyExplorer.querySelector('.csw-fx-title');
    const sub = familyExplorer.querySelector('.csw-fx-subtitle');
    const back = familyExplorer.querySelector('.csw-fx-back');
    body.replaceChildren();

    if (!familyExplorerAnchorId) {
      title.textContent = '系譜から探す';
      sub.textContent = '掲載情報を起点に探索。根拠の接続状態は図で区別';
      back.setAttribute('aria-label', '系譜探索を閉じる');
      const intro = document.createElement('p');
      intro.className = 'csw-fx-intro';
      intro.textContent = '系統を選ぶ';
      const grid = document.createElement('div');
      grid.className = 'csw-fx-grid';
      let rendered = 0;
      for (const anchorSpec of HOME_FAMILY_ANCHORS) {
        const members = familyMembers(familyExplorerCatalog, anchorSpec.id);
        if (members.length < 2) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'csw-fx-family';
        button.dataset.ftFamilyAnchor = anchorSpec.id;
        const copy = document.createElement('span');
        const name = document.createElement('strong');
        name.textContent = anchorSpec.label;
        const note = document.createElement('small');
        note.textContent = anchorSpec.note;
        copy.append(name, note);
        const count = document.createElement('b');
        count.textContent = members.length + '品種';
        button.append(copy, count);
        grid.appendChild(button);
        rendered += 1;
      }
      body.append(intro, grid);
      window.__CSWFamilyExplorerV1 = {
        status: 'PASS',
        mode: 'families',
        familyCount: rendered,
        anchors: HOME_FAMILY_ANCHORS.map(item => item.id)
      };
      return;
    }

    const spec = familyAnchor(familyExplorerAnchorId);
    const members = familyMembers(familyExplorerCatalog, familyExplorerAnchorId);
    title.textContent = spec?.label || '系譜から探す';
    sub.textContent = spec?.note || '確認済みの系譜';
    back.setAttribute('aria-label', '系統一覧へ戻る');
    const intro = document.createElement('p');
    intro.className = 'csw-fx-intro';
    intro.textContent = '品種を選ぶと、その品種を中心に系譜図を開きます';
    const list = document.createElement('div');
    list.className = 'csw-fx-member-list';
    for (const member of members) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'csw-fx-member';
      button.dataset.ftFamilyMember = member.cultivar.id;
      const visual = visualFor(member.cultivar);
      const media = document.createElement('span');
      media.className = 'csw-fx-member-media';
      if (visual?.src) {
        const img = document.createElement('img');
        img.src = visual.src;
        img.alt = '';
        img.loading = 'lazy';
        media.appendChild(img);
      }
      const copy = document.createElement('span');
      copy.className = 'csw-fx-member-copy';
      const name = document.createElement('strong');
      name.textContent = member.cultivar.name;
      const depth = document.createElement('small');
      depth.textContent = member.depth === 0 ? '起点' : member.depth + '世代下';
      copy.append(name, depth);
      const arrow = document.createElement('span');
      arrow.className = 'csw-fx-member-arrow';
      arrow.textContent = '›';
      arrow.setAttribute('aria-hidden', 'true');
      button.append(media, copy, arrow);
      list.appendChild(button);
    }
    body.append(intro, list);
    window.__CSWFamilyExplorerV1 = {
      status: 'PASS',
      mode: 'members',
      familyId: familyExplorerAnchorId,
      memberCount: members.length,
      members: members.map(item => item.cultivar.id)
    };
  };

  const closeFamilyExplorer = () => {
    if (!familyExplorer?.open) return;
    familyExplorer.close();
    familyExplorerAnchorId = '';
    if (!overlay?.open) {
      document.documentElement.classList.remove('csw-ft-body-lock');
      document.body.classList.remove('csw-ft-body-lock');
    }
  };

  const ensureFamilyExplorer = () => {
    if (familyExplorer) return familyExplorer;
    familyExplorer = document.createElement('dialog');
    familyExplorer.className = 'csw-family-explorer-v1';
    familyExplorer.setAttribute('role', 'dialog');
    familyExplorer.setAttribute('aria-modal', 'true');
    familyExplorer.setAttribute('aria-label', '系譜から探す');
    familyExplorer.innerHTML = '<header class="csw-fx-header"><button type="button" class="csw-fx-back" aria-label="系譜探索を閉じる">←</button><div><small>FAMILY TREE</small><strong class="csw-fx-title">系譜から探す</strong><span class="csw-fx-subtitle">掲載情報から系譜を探す</span></div></header><div class="csw-fx-body"></div><footer class="csw-fx-footer">系統一覧は掲載情報をもとにした探索入口です。正式根拠の接続状態は系譜図で区別します。</footer>';
    document.body.appendChild(familyExplorer);
    familyExplorer.querySelector('.csw-fx-back').addEventListener('click', () => {
      if (familyExplorerAnchorId) {
        familyExplorerAnchorId = '';
        renderFamilyExplorer();
      } else {
        closeFamilyExplorer();
      }
    });
    familyExplorer.addEventListener('cancel', event => {
      event.preventDefault();
      closeFamilyExplorer();
    });
    familyExplorer.addEventListener('click', event => {
      const familyButton = event.target.closest('[data-ft-family-anchor]');
      if (familyButton) {
        familyExplorerAnchorId = familyButton.dataset.ftFamilyAnchor;
        renderFamilyExplorer();
        familyExplorer.querySelector('.csw-fx-back').focus({ preventScroll: true });
        return;
      }
      const memberButton = event.target.closest('[data-ft-family-member]');
      if (memberButton) {
        const id = memberButton.dataset.ftFamilyMember;
        const returnAnchorId = familyExplorerAnchorId;
        closeFamilyExplorer();
        openTree(id, null, returnAnchorId).catch(failClosed);
      }
    });
    return familyExplorer;
  };

  const showFamilyExplorer = anchorId => {
    if (!familyExplorerCatalog) return false;
    ensureFamilyExplorer();
    familyExplorerAnchorId = text(anchorId);
    renderFamilyExplorer();
    if (!familyExplorer.open) familyExplorer.showModal();
    document.documentElement.classList.add('csw-ft-body-lock');
    document.body.classList.add('csw-ft-body-lock');
    familyExplorer.querySelector('.csw-fx-back').focus({ preventScroll: true });
    return true;
  };

  const openFamilyExplorer = async () => {
    familyExplorerCatalog = await loadCatalog();
    validateTypedRelations(familyExplorerCatalog);
    return showFamilyExplorer('');
  };

  const returnToFamilyExplorer = () => {
    const anchorId = familyTreeReturnAnchorId;
    familyTreeReturnAnchorId = '';
    if (!anchorId || !familyExplorerCatalog) return false;
    return showFamilyExplorer(anchorId);
  };

  const bindHomeFamilyEntry = () => {
    const button = document.querySelector('[data-family-tree-home-entry="v1"]');
    if (!button || button.dataset.familyTreeBound === 'v1') return false;
    button.dataset.familyTreeBound = 'v1';
    button.addEventListener('click', () => openFamilyExplorer().catch(failClosed));
    return true;
  };

  const ensureOverlay = () => {
    if (overlay) return overlay;
    overlay = document.createElement('dialog');
    overlay.className = 'csw-family-tree-v1';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '系譜図ビュー');
    overlay.innerHTML = '<header class="csw-ft-header"><button type="button" class="csw-ft-close" aria-label="系譜図を閉じる">←</button><div><small>FAMILY TREE</small><strong class="csw-ft-title">系譜図</strong><span class="csw-ft-direction">↑ 親・祖先　｜　子・派生 ↓</span></div><span class="csw-ft-depth">上下2世代</span></header><nav class="csw-ft-direction-controls" aria-label="系譜の表示方向"><button type="button" data-ft-direction="all">親・子</button><button type="button" data-ft-direction="ancestors">祖先</button><button type="button" data-ft-direction="descendants">子・派生</button></nav><section class="csw-ft-tools" aria-label="系譜探索の操作"><div class="csw-ft-toolbar"><button type="button" data-ft-back-one disabled>戻る1件</button><button type="button" data-ft-share>共有URL</button></div><label class="csw-ft-search-label">品種名・別名で検索<input type="search" data-ft-search-input autocomplete="off" placeholder="品種名・aliasを入力" aria-label="系譜内の品種を検索"></label><div class="csw-ft-search-results" data-ft-search-results aria-live="polite"></div><div class="csw-ft-share-panel" data-ft-share-panel hidden><label>共有用URL<input data-ft-share-url readonly aria-label="共有用URL"></label><button type="button" data-ft-copy>コピー</button></div></section><div class="csw-ft-viewport" tabindex="0"><div class="csw-ft-stage"></div></div><footer class="csw-ft-footer">実線：根拠確認済み ／ 破線：掲載情報のみ（未審査）</footer>';
    document.body.appendChild(overlay);
    viewport = overlay.querySelector('.csw-ft-viewport');
    stage = overlay.querySelector('.csw-ft-stage');
    // Isolate the drawing in a stable CSS coordinate space. The holder alone changes
    // scroll dimensions: node cards AND their SVG edges receive the same transform.
    const world=document.createElement('div');
    world.className='csw-ft-zoom-world';
    world.style.cssText='position:relative;margin-inline:auto;min-width:0;width:max-content;height:auto';
    stage.before(world);world.appendChild(stage);
    stage.style.width='max-content';
    stage.style.minHeight='0';
    stage.style.transformOrigin='0 0';
    let scale=1, pinch=null;
    syncWorldSize=()=>{
      const w=Math.max(stage.offsetWidth,stage.scrollWidth);
      const h=Math.max(stage.offsetHeight,stage.scrollHeight);
      if(!(w>0&&h>0))return;
      world.style.width=(w*scale)+'px';
      world.style.height=(h*scale)+'px';
      stage.dataset.ftVisualScale=String(scale);
      stage.style.transform='scale('+scale+')';
    };
    const applyScale=next=>{
      const prior=scale;
      scale=Math.max(.72,Math.min(1.7,next));
      if(Math.abs(scale-prior)<.001)return;
      const midX=viewport.clientWidth/2, midY=viewport.clientHeight/2;
      const left=viewport.scrollLeft, top=viewport.scrollTop;
      syncWorldSize();
      // Preserve viewport focus under zoom; native scrolling handles panning.
      viewport.scrollLeft=Math.max(0,(left+midX)*scale/prior-midX);
      viewport.scrollTop=Math.max(0,(top+midY)*scale/prior-midY);
    };
    // The previous toolbar is intentionally hidden; +/- and reset controls stay
    // wired but do not take up screen space in the owner's minimal preview.
    const zoom=document.createElement('div');
    zoom.className='csw-ft-proto-zoom';
    zoom.setAttribute('aria-label','2世代表示の拡大縮小（試作）');
    zoom.innerHTML='<span>2世代の表示調整</span><button type="button" data-ft-proto-zoom="out" aria-label="縮小">−</button><button type="button" data-ft-proto-zoom="in" aria-label="拡大">＋</button><button type="button" data-ft-proto-zoom="reset">戻す</button>';
    overlay.querySelector('.csw-ft-tools').appendChild(zoom);
    zoom.addEventListener('click',e=>{const cmd=e.target.closest('[data-ft-proto-zoom]')?.dataset.ftProtoZoom;if(!cmd)return;applyScale(cmd==='reset'?1:scale+(cmd==='in'?.15:-.15));});
    const dist=e=>Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    viewport.addEventListener('touchstart',e=>{if(e.touches.length===2)pinch={distance:dist(e),scale};},{passive:true});
    viewport.addEventListener('touchmove',e=>{if(e.touches.length===2&&pinch){e.preventDefault();applyScale(pinch.scale*dist(e)/pinch.distance);}},{passive:false});
    viewport.addEventListener('touchend',e=>{if(e.touches.length<2)pinch=null;},{passive:true});
    viewport.addEventListener('touchcancel',()=>{pinch=null;},{passive:true});
    const summary = document.createElement('p');
    summary.className = 'csw-ft-status-summary';
    summary.setAttribute('aria-live','polite');
    overlay.querySelector('.csw-ft-footer').prepend(summary);
    const searchInput = overlay.querySelector('[data-ft-search-input]');
    searchInput.addEventListener('input', () => renderSearchResults().catch(failClosed));
    stage = overlay.querySelector('.csw-ft-stage');
    overlay.querySelector('.csw-ft-close').addEventListener('click', closeTreeToOrigin);
    overlay.addEventListener('cancel', event => {
      event.preventDefault();
      closeTreeToOrigin();
    });
    overlay.addEventListener('click', event => {
      const oneBack = event.target.closest('[data-ft-back-one]');
      if (oneBack) {
        if (Number(history.state?.[STATE_KEY]?.trailDepth || 0) > 0) history.back();
        return;
      }
      const shareButton = event.target.closest('[data-ft-share]');
      if (shareButton) { showShareLink(); return; }
      const copyButton = event.target.closest('[data-ft-copy]');
      if (copyButton) {
        const field = overlay.querySelector('[data-ft-share-url]');
        field.select();
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(field.value).catch(() => {});
        return;
      }
      const searchButton = event.target.closest('[data-ft-search-id]');
      if (searchButton) {
        switchCenter(searchButton.dataset.ftSearchId).then(changed => {
          if (changed) {
            overlay.querySelector('[data-ft-search-input]').value = '';
            overlay.querySelector('[data-ft-search-results]').replaceChildren();
          }
        }).catch(failClosed);
        return;
      }
      const directionButton = event.target.closest('[data-ft-direction]');
      if (directionButton) {
        const next = directionButton.dataset.ftDirection;
        if (!['all', 'ancestors', 'descendants'].includes(next) || next === direction) return;
        direction = next;
        persistState(); // replaceState only; switching views must not create history entries.
        renderGraph();
        return;
      }
      const evidenceButton = event.target.closest('[data-ft-evidence-claim]');
      if (evidenceButton) { openEvidence(evidenceButton); return; }
      const toggleButton = event.target.closest('[data-ft-expand],[data-ft-collapse]');
      if (toggleButton) {
        if (toggleButton.dataset.ftCollapse) expanded.delete(toggleButton.dataset.ftCollapse);
        else expanded.add(toggleButton.dataset.ftExpand);
        persistState();
        renderGraph();
        return;
      }
      const nodeButton = event.target.closest('[data-ft-node-id]');
      if (nodeButton) navigateToNode(nodeButton.dataset.ftNodeId);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && overlay && overlay.open && !evidenceSheet?.open) {
        closeTreeToOrigin();
      }
    });
    return overlay;
  };

  const injectStyles = () => {
    if (document.getElementById('csw-family-tree-v1-style')) return;
    const style = document.createElement('style');
    style.id = 'csw-family-tree-v1-style';
    style.textContent = '.csw-ft-entry{display:flex;width:100%;min-height:44px;align-items:center;justify-content:space-between;gap:10px;margin:12px 0 2px;padding:10px 12px;border:1px solid rgba(216,189,98,.2);border-radius:12px;background:linear-gradient(135deg,rgba(216,189,98,.08),rgba(255,255,255,.018));color:#e6d58f;font:800 12px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:left}.csw-ft-entry small{color:#7f9187;font-size:9px;font-weight:800;letter-spacing:.1em}.csw-ft-entry:after{content:"›";font-size:20px;color:#b9a257}.csw-family-tree-v1{position:fixed;inset:0;box-sizing:border-box;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;z-index:999;background:#06100c;color:#edf1e9;display:grid;grid-template-rows:auto minmax(0,1fr) auto}.csw-family-tree-v1:not([open]){display:none}.csw-family-tree-v1::backdrop{background:rgba(0,0,0,.72)}.csw-ft-header{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:10px;padding:max(10px,env(safe-area-inset-top)) 12px 10px;border-bottom:1px solid rgba(216,189,98,.16);background:rgba(4,12,8,.98)}.csw-ft-close{width:44px;height:44px;border:1px solid rgba(255,255,255,.1);border-radius:50%;background:rgba(255,255,255,.025);color:#edf1e9;font-size:22px}.csw-ft-header>div{display:grid;gap:2px}.csw-ft-header small{color:#d8bd62;font-size:9px;font-weight:900;letter-spacing:.13em}.csw-ft-title{font-size:16px;line-height:1.2}.csw-ft-direction{color:#aab7af;font-size:9.5px;font-weight:800;line-height:1.25;white-space:nowrap}.csw-ft-depth{color:#829087;font-size:9px;font-weight:750}.csw-ft-viewport{position:relative;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:22px 16px 40px}.csw-ft-stage{position:relative;display:grid;gap:62px;min-width:max-content;min-height:100%;padding:12px 18px 32px}.csw-ft-level{position:relative;z-index:2;display:flex;justify-content:center;align-items:center;gap:18px;min-height:92px}.csw-ft-level:before{content:attr(data-level-label);position:absolute;left:50%;top:-27px;z-index:4;transform:translateX(-50%);padding:3px 9px;border:1px solid rgba(216,189,98,.12);border-radius:999px;background:#06100c;color:#819188;font-size:8.5px;font-weight:850;letter-spacing:.08em;line-height:1.2;white-space:nowrap}.csw-ft-level[data-depth="0"]{min-height:108px}.csw-ft-level[data-depth="0"]:before{color:#cdb766;border-color:rgba(216,189,98,.2)}.csw-ft-node-wrap{display:grid;justify-items:center;gap:7px;width:138px}.csw-ft-node{display:grid;width:138px;min-height:72px;grid-template-columns:36px minmax(0,1fr);align-items:center;gap:8px;padding:8px;border:1px solid rgba(255,255,255,.12);border-radius:13px;background:#0a1711;color:#edf1e9;text-align:left;box-shadow:0 10px 26px rgba(0,0,0,.2)}.csw-ft-node.is-current{border-color:rgba(216,189,98,.62);background:linear-gradient(145deg,rgba(216,189,98,.16),rgba(43,86,56,.28))}.csw-ft-node.is-unpublished{display:flex;justify-content:center;min-height:58px;background:rgba(255,255,255,.018);border-style:dashed;color:#9baa9f;text-align:center}.csw-ft-thumb{width:36px;height:36px;border-radius:9px;object-fit:cover;background:#111}.csw-ft-copy{display:grid;gap:3px;min-width:0}.csw-ft-copy strong{font-size:11.5px;line-height:1.25;overflow-wrap:anywhere}.csw-ft-copy small{color:#84958b;font-size:7.5px;font-weight:850;letter-spacing:.08em}.csw-ft-expand{min-height:28px;padding:4px 8px;border:1px solid rgba(216,189,98,.17);border-radius:999px;background:rgba(216,189,98,.04);color:#bdaa6b;font-size:9px;font-weight:800}.csw-ft-svg{position:absolute;inset:0;z-index:1;overflow:visible;pointer-events:none}.csw-ft-svg path{fill:none;stroke:rgba(216,189,98,.42);stroke-width:1.25;stroke-linecap:round}.csw-ft-svg path.is-selected-cut,.csw-ft-svg path.is-selection,.csw-ft-svg path.is-selected-phenotype,.csw-ft-svg path.is-selected-line,.csw-ft-svg path.is-other{stroke-dasharray:4 4}.csw-ft-svg path.is-s1,.csw-ft-svg path.is-bx{stroke-width:1.7}.csw-ft-edge-label{position:absolute;z-index:3;transform:translate(-50%,-50%);padding:2px 5px;border:1px solid rgba(216,189,98,.16);border-radius:999px;background:#07120d;color:#aab7af;font-size:7.5px;font-weight:850;line-height:1.1;white-space:nowrap;pointer-events:none}.csw-ft-footer{padding:10px 14px max(10px,env(safe-area-inset-bottom));border-top:1px solid rgba(216,189,98,.12);background:rgba(4,12,8,.98);color:#7f9187;font-size:9px;line-height:1.5}.home-family-tree-entry{display:flex;width:100%;min-height:72px;align-items:center;justify-content:space-between;gap:12px;margin:8px 0 15px;padding:11px 13px;border:1px solid rgba(216,189,98,.22);border-radius:13px;background:linear-gradient(145deg,rgba(216,189,98,.075),rgba(10,29,19,.68));color:#e9e2c9;text-align:left;box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}.home-family-tree-copy{display:grid;gap:3px;min-width:0}.home-family-tree-copy>span{color:#d8bd62;font-size:7px;font-weight:950;letter-spacing:.15em}.home-family-tree-copy strong{font-size:12px;line-height:1.2}.home-family-tree-copy small{color:#87988e;font-size:8px;line-height:1.35}.home-family-tree-arrow{flex:0 0 auto;color:#d8bd62;font-size:22px;line-height:1}.home-family-tree-entry:active{transform:scale(.99)}.csw-family-explorer-v1{position:fixed;inset:0;box-sizing:border-box;width:100%;height:100%;max-width:none;max-height:none;margin:0;padding:0;border:0;z-index:998;background:#06100c;color:#edf1e9;display:grid;grid-template-rows:auto minmax(0,1fr) auto}.csw-family-explorer-v1:not([open]){display:none}.csw-family-explorer-v1::backdrop{background:rgba(0,0,0,.72)}.csw-fx-header{display:grid;grid-template-columns:44px minmax(0,1fr);align-items:center;gap:10px;padding:max(10px,env(safe-area-inset-top)) 12px 10px;border-bottom:1px solid rgba(216,189,98,.16);background:rgba(4,12,8,.98)}.csw-fx-back{width:44px;height:44px;border:1px solid rgba(255,255,255,.1);border-radius:50%;background:rgba(255,255,255,.025);color:#edf1e9;font-size:22px}.csw-fx-header>div{display:grid;gap:2px}.csw-fx-header small{color:#d8bd62;font-size:9px;font-weight:900;letter-spacing:.13em}.csw-fx-title{font-size:16px;line-height:1.2}.csw-fx-subtitle{color:#87988e;font-size:9px;font-weight:750;line-height:1.3}.csw-fx-body{overflow:auto;padding:20px 16px 34px;-webkit-overflow-scrolling:touch}.csw-fx-intro{margin:0 0 12px;color:#94a39a;font-size:10px;font-weight:750;line-height:1.5}.csw-fx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.csw-fx-family{display:flex;min-height:88px;align-items:flex-end;justify-content:space-between;gap:8px;padding:11px;border:1px solid rgba(216,189,98,.16);border-radius:13px;background:linear-gradient(145deg,rgba(22,48,32,.72),rgba(5,15,10,.92));color:#edf1e9;text-align:left}.csw-fx-family>span{display:grid;gap:4px;min-width:0}.csw-fx-family strong{font-size:12px;line-height:1.25}.csw-fx-family small{color:#829188;font-size:8px;line-height:1.3}.csw-fx-family b{flex:0 0 auto;padding:3px 6px;border:1px solid rgba(216,189,98,.18);border-radius:999px;color:#d8bd62;font-size:7px;white-space:nowrap}.csw-fx-member-list{display:grid;gap:8px}.csw-fx-member{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:10px;min-height:62px;padding:9px 10px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.025);color:#edf1e9;text-align:left}.csw-fx-member-media{display:grid;width:42px;height:42px;place-items:center;overflow:hidden;border-radius:9px;background:rgba(255,255,255,.035)}.csw-fx-member-media img{width:100%;height:100%;object-fit:cover}.csw-fx-member-copy{display:grid;gap:3px;min-width:0}.csw-fx-member-copy strong{font-size:12px;line-height:1.25}.csw-fx-member-copy small{color:#87988e;font-size:8px;font-weight:800}.csw-fx-member-arrow{color:#d8bd62;font-size:18px}.csw-fx-footer{padding:10px 14px max(10px,env(safe-area-inset-bottom));border-top:1px solid rgba(216,189,98,.12);background:rgba(4,12,8,.98);color:#7f9187;font-size:9px;line-height:1.5}.csw-ft-body-lock{overflow:hidden!important}@media(max-width:390px){.csw-ft-viewport{padding-inline:10px}.csw-ft-stage{gap:56px;padding-inline:10px}.csw-ft-level{gap:12px}.csw-ft-node-wrap,.csw-ft-node{width:132px}.csw-ft-node{grid-template-columns:32px minmax(0,1fr);min-height:74px;padding:7px}.csw-ft-thumb{width:32px;height:32px}.csw-ft-copy strong{font-size:12.5px;line-height:1.3}.csw-ft-copy small{font-size:8.5px}.csw-ft-edge-label{font-size:8.5px;padding:2px 6px}.csw-ft-footer{font-size:10px;line-height:1.55}.csw-ft-direction{font-size:10px}.csw-ft-depth{font-size:9.5px}}';
    style.textContent += '.csw-ft-evidence-button{min-height:44px;width:100%;border:1px solid #70643e;border-radius:10px;background:#14251b;color:#e6d58f;font:700 10px/1.4 system-ui;padding:8px}.csw-ft-evidence-sheet{position:fixed;inset:auto 0 0;box-sizing:border-box;width:min(100%,520px);max-width:100%;max-height:80dvh;margin:0 auto;padding:20px 20px max(24px,env(safe-area-inset-bottom));overflow:auto;border:1px solid #70643e;border-radius:18px 18px 0 0;background:#0a1711;color:#edf1e9;font:14px/1.6 system-ui;overflow-wrap:anywhere}.csw-ft-evidence-sheet::backdrop{background:rgba(0,0,0,.58)}.csw-ft-evidence-sheet h2{font-size:19px}.csw-ft-evidence-close{min-width:72px;min-height:44px;float:right;background:#14251b;color:#edf1e9;border:1px solid #70643e;border-radius:9px}.csw-ft-evidence-label{color:#e6d58f;font-weight:800}.csw-ft-evidence-source{display:inline-flex;align-items:center;min-height:44px;color:#e6d58f}';
    style.textContent += '.csw-family-tree-v1{grid-template-rows:auto auto minmax(0,1fr) auto}.csw-ft-direction-controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;padding:8px 12px;border-bottom:1px solid rgba(216,189,98,.14);background:#06100c}.csw-ft-direction-controls button{min-width:0;min-height:44px;border:1px solid rgba(216,189,98,.25);border-radius:8px;background:#14251b;color:#aab7af;font:800 11px/1.2 system-ui}.csw-ft-direction-controls button[aria-pressed="true"]{color:#e6d58f;border-color:#d8bd62;background:#1c3023}';
    style.textContent += '.csw-ft-tools{padding:8px 12px;background:#07140e;border-bottom:1px solid rgba(216,189,98,.14);display:grid;gap:7px}.csw-ft-toolbar{display:grid;grid-template-columns:1fr 1fr;gap:8px}.csw-ft-toolbar button,.csw-ft-share-panel button{min-height:44px;border:1px solid rgba(216,189,98,.35);background:#14251b;border-radius:8px;color:#e6d58f;font:700 11px system-ui}.csw-ft-toolbar button:disabled{opacity:.35}.csw-ft-search-label,.csw-ft-share-panel label{display:grid;gap:4px;color:#b7c1b7;font:700 10px system-ui}.csw-ft-search-label input,.csw-ft-share-panel input{width:100%;box-sizing:border-box;min-height:44px;border:1px solid #536a58;border-radius:8px;background:#07130d;color:white;padding:8px 10px;font:14px system-ui}.csw-ft-search-results{display:grid;gap:4px;max-height:128px;overflow-y:auto}.csw-ft-search-results button{min-height:44px;background:#10241a;border:1px solid #465c49;color:#e7eadf;border-radius:8px;padding:7px 10px;text-align:left;font:700 11px system-ui}.csw-ft-search-results button:disabled{opacity:.45}.csw-ft-search-results small{display:block;font-size:9px;color:#a3b7aa}.csw-ft-share-panel:not([hidden]){display:grid;grid-template-columns:minmax(0,1fr) 65px;gap:8px;align-items:end}.csw-family-tree-v1{grid-template-rows:auto auto auto minmax(0,1fr) auto}';
    style.textContent += '.csw-ft-detail-button{min-height:44px;width:100%;margin-top:4px;padding:7px 10px;border:1px solid rgba(216,189,98,.35);border-radius:9px;background:#10241a;color:#dfc97a;font:700 11px/1.3 system-ui;text-align:center}';
    style.textContent += '.csw-ft-svg path[data-ft-admission="held"]{stroke-dasharray:3 5;opacity:.72}.csw-ft-svg path[data-ft-admission="admitted"]{stroke-dasharray:none;opacity:1}.csw-ft-node.is-unpublished{flex-direction:column;gap:4px}.csw-ft-lineage-boundary{display:block;color:#c8ba8b;font-size:8px;line-height:1.3}';
    style.textContent += '.csw-ft-evidence-details summary{min-height:44px;display:flex;align-items:center;color:#e6d58f;cursor:pointer}.csw-ft-evidence-details{margin-top:8px;border-top:1px solid rgba(216,189,98,.16)}';
    style.textContent += '.csw-ft-status-summary{margin:0 0 5px;font-size:10px;line-height:1.5;font-weight:750;color:#d8c78c}';
    style.textContent += '.csw-ft-node-wrap,.csw-ft-node{width:160px}.csw-ft-node{grid-template-columns:48px minmax(0,1fr);min-height:82px}.csw-ft-thumb{width:48px;height:48px}.csw-ft-copy strong{font-size:12px}.csw-ft-combination-note{font-size:9px!important;color:#e6d58f!important;line-height:1.4}.csw-ft-search-results button{display:flex;align-items:center;gap:9px}.csw-ft-search-thumb{width:34px;height:34px;object-fit:cover;border-radius:7px;flex:none}.csw-ft-search-name{min-width:0;flex:1}.csw-ft-proto-zoom{display:flex;align-items:center;justify-content:flex-end;gap:6px}.csw-ft-proto-zoom span{font-size:10px;color:#b7c1b7;margin-right:auto}.csw-ft-proto-zoom button{min-width:44px;min-height:44px;border:1px solid #70643e;border-radius:8px;background:#14251b;color:#e6d58f;font-weight:800}@media(max-width:390px){.csw-ft-node-wrap,.csw-ft-node{width:155px}.csw-ft-node{grid-template-columns:44px minmax(0,1fr)}.csw-ft-thumb{width:44px;height:44px}}';
    style.textContent += '.csw-ft-evidence-button{min-height:44px;width:100%;padding:8px 9px;border-color:rgba(216,189,98,.24);border-radius:9px;background:rgba(216,189,98,.045);font-size:10px;line-height:1.5;font-weight:700;color:#d7c68b}';
    // Owner iPhone review: hide search, 'back one', share URL, and +/- zoom controls for now.
    // Keep the pre-existing controls in source for reversible reintroduction, and preserve pinch gestures.
    style.textContent += '.csw-family-tree-v1{grid-template-rows:auto auto minmax(0,1fr) auto}.csw-family-tree-v1 .csw-ft-tools{display:none!important}';
    document.head.appendChild(style);
  };

  const renderSearchResults = async () => {
    const input = overlay?.querySelector('[data-ft-search-input]');
    const list = overlay?.querySelector('[data-ft-search-results]');
    if (!input || !list) return;
    const currentGeneration = ++searchGeneration;
    const query = normalize(input.value);
    list.replaceChildren();
    if (!query || !overlay.open) return;
    const catalog = await loadCatalog();
    if (currentGeneration !== searchGeneration || !overlay.open || normalize(input.value) !== query) return;
    const matches = (catalog?.cultivars || []).filter(item =>
      [item.id, item.name, ...(item.aliases || [])].some(raw => normalize(raw).includes(query))
    ).sort((a,b)=>String(a.name).localeCompare(String(b.name),'ja') || String(a.id).localeCompare(String(b.id),'en'));
    if (!matches.length) {
      list.textContent = '一致する公開品種がありません';
      return;
    }
    for (const item of matches.slice(0,20)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.ftSearchId = item.id; // published canonical ID only
      const image = visualFor(item);
      if (image?.src) { const thumb=document.createElement('img'); thumb.className='csw-ft-search-thumb';thumb.src=image.src;thumb.alt='';thumb.loading='lazy';button.appendChild(thumb); }
      const label=document.createElement('span');label.className='csw-ft-search-name';label.textContent=item.name;button.appendChild(label);
      const small = document.createElement('small');
      small.textContent = item.id;
      button.appendChild(small);
      // An ambiguous alias is never auto-resolved. Each ID requires selection.
      const canExplore = Boolean(buildGraph(catalog,item).edges.length);
      // B15: choosing a published identity with zero edges is safe; never infer links.
      if (!canExplore) small.textContent += ' · 関係線未接続（探索可能）';
      list.appendChild(button);
    }
    if(matches.length>20){
      const more=document.createElement('span');
      more.textContent=matches.length+'件一致。検索語を追加してください';
      list.appendChild(more);
    }
  };
  const shareUrl = () => {
    const url = new URL(location.pathname, location.origin);
    url.searchParams.set('strain', centerId);
    url.searchParams.set('direction', direction);
    return url.href;
  };
  const showShareLink = () => {
    if (!centerId || !overlay?.open) return;
    const panel = overlay.querySelector('[data-ft-share-panel]');
    panel.hidden = false;
    const input = panel.querySelector('[data-ft-share-url]');
    input.value = shareUrl();
    input.focus({ preventScroll:true });
    input.select();
  };

  const persistState = () => {
    if (!centerId || !overlay || !overlay.open) return;
    const previous = history.state?.[STATE_KEY] || {};
    const next = { ...history.state, [STATE_KEY]: {
      ...previous,
      centerId,
      direction,
      returnAnchorId: familyTreeReturnAnchorId,
      originType: previous.originType || (currentId() ? 'detail' : 'home'),
      originUrl: previous.originUrl || location.href,
      trailDepth: Number.isSafeInteger(previous.trailDepth) ? previous.trailDepth : 0,
      expanded: [...expanded],
      scrollTop: viewport?.scrollTop || 0,
      scrollLeft: viewport?.scrollLeft || 0
    } };
    history.replaceState(next, '', location.href);
  };

  const clearStoredState = () => {
    const next = { ...history.state };
    delete next[STATE_KEY];
    history.replaceState(next, '', location.href);
  };

  const closeOverlay = (clear, persist = !clear) => {
    if (!overlay || !overlay.open) return;
    if (persist) persistState();
    closeEvidence();
    overlay.close();
    document.documentElement.classList.remove('csw-ft-body-lock');
    document.body.classList.remove('csw-ft-body-lock');
    if (clear) clearStoredState();
    if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
  };

  const drawEdges = visible => {
    const oldSvg = stage.querySelector('.csw-ft-svg');
    if (oldSvg) oldSvg.remove();
    stage.querySelectorAll('.csw-ft-edge-label').forEach(node => node.remove());
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('csw-ft-svg');
    const width = Math.max(stage.scrollWidth, stage.clientWidth);
    const height = Math.max(stage.scrollHeight, stage.clientHeight);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', 'csw-ft-arrow-v1');
    marker.setAttribute('viewBox', '0 0 6 6');
    marker.setAttribute('refX', '5.5');
    marker.setAttribute('refY', '3');
    marker.setAttribute('markerWidth', '5');
    marker.setAttribute('markerHeight', '5');
    marker.setAttribute('orient', 'auto');
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrow.setAttribute('d', 'M 0 0 L 6 3 L 0 6 z');
    arrow.setAttribute('fill', 'rgba(216,189,98,.56)');
    marker.appendChild(arrow);
    defs.appendChild(marker);
    svg.appendChild(defs);
    stage.prepend(svg);
    const stageRect = stage.getBoundingClientRect();
    const visualScale = Number(stage.dataset.ftVisualScale || 1);
    // Keep the existing graph engine. Group only independently FORMALLY admitted
    // direct-parent edges by their actual child. Legacy/public display edges are
    // never promoted into a verified parental combination by this renderer.
    const admittedGroups = new Map();
    for (const edge of visible.edges) {
      if (!b6AdmittedEdge(edge,graphState)) continue;
      const group=admittedGroups.get(edge.to)||[];
      group.push(edge);admittedGroups.set(edge.to,group);
    }
    const joinedEdges=new Set();
    for (const [childKey, approvedPair] of admittedGroups) {
      // Exactly 2 admitted direct contributors and visible nodes form a joint.
      // One contributor stays a single arrow; >2 must not invent crossing order.
      if (approvedPair.length!==2 || approvedPair[0].from===approvedPair[1].from) continue;
      const pairTarget=stage.querySelector('[data-ft-node-key="'+CSS.escape(childKey)+'"]');
      const pairParents=approvedPair.map(edge=>stage.querySelector('[data-ft-node-key="'+CSS.escape(edge.from)+'"]'));
      if (!pairTarget || pairParents.some(el=>!el)) continue;
      const approvedChild=graphState.nodes.get(childKey);
      if (!approvedChild?.id) continue;
      const rect=stage.getBoundingClientRect();
      const pts=pairParents.map(el=>{const r=el.getBoundingClientRect();return {x:(r.left-rect.left+r.width/2)/visualScale,y:(r.bottom-rect.top)/visualScale};});
      const c=pairTarget.getBoundingClientRect();
      const cx=(c.left-rect.left+c.width/2)/visualScale, cy=(c.top-rect.top)/visualScale;
      const jy=(Math.max(pts[0].y,pts[1].y)+cy)/2, jx=(pts[0].x+pts[1].x)/2;
      const makePath=(d,last)=>{const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',d);p.dataset.ftApprovedPair=approvedChild.id;p.dataset.ftAdmission='admitted';p.setAttribute('fill','none');p.setAttribute('vector-effect','non-scaling-stroke');if(last)p.setAttribute('marker-end','url(#csw-ft-arrow-v1)');svg.appendChild(p);};
      pts.forEach(p=>makePath('M '+p.x+' '+p.y+' L '+p.x+' '+jy+' L '+jx+' '+jy,false));
      makePath('M '+jx+' '+jy+' L '+cx+' '+jy+' L '+cx+' '+cy,true);
      const joint=document.createElementNS('http://www.w3.org/2000/svg','circle');joint.setAttribute('cx',String(jx));joint.setAttribute('cy',String(jy));joint.setAttribute('r','4');joint.setAttribute('fill','#d8bd62');joint.dataset.ftPairJunction=approvedChild.id;svg.appendChild(joint);
      approvedPair.forEach(edge=>joinedEdges.add(edge));
    }
    for (const edge of visible.edges) {
      if (joinedEdges.has(edge)) continue;
      const from = stage.querySelector('[data-ft-node-key="' + CSS.escape(edge.from) + '"]');
      const to = stage.querySelector('[data-ft-node-key="' + CSS.escape(edge.to) + '"]');
      if (!from || !to) continue;
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const upward = b.top < a.top;
      const x1 = (a.left - stageRect.left + a.width / 2)/visualScale;
      const y1 = (upward ? a.top - stageRect.top : a.bottom - stageRect.top)/visualScale;
      const x2 = (b.left - stageRect.left + b.width / 2)/visualScale;
      const y2 = (upward ? b.bottom - stageRect.top : b.top - stageRect.top)/visualScale;
      const mid = (y1 + y2) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + mid + ', ' + x2 + ' ' + mid + ', ' + x2 + ' ' + y2);
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      path.setAttribute('marker-end', 'url(#csw-ft-arrow-v1)');
      path.classList.add('is-' + edge.relation.type);
      const admitted = b6AdmittedEdge(edge, graphState);
      path.dataset.ftAdmission = admitted ? 'admitted' : 'held';
      const tip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      tip.textContent = admitted ? '正式承認済みの直接親' : '既存掲載情報からの表示（正式根拠は未接続）';
      path.appendChild(tip);
      svg.appendChild(path);
      if (edge.relation.type !== 'parent') {
        const label = document.createElement('span');
        label.className = 'csw-ft-edge-label';
        // B12: legacy/typed labels are display-only unless THIS edge is formally admitted.
        label.textContent = publicRelationLabel(edge.relation) + (admitted ? '' : ' · 表示のみ');
        label.dataset.ftRelationAuthority = admitted ? 'formally-admitted' : 'display-only';
        label.style.left = ((x1 + x2) / 2) + 'px';
        label.style.top = mid + 'px';
        stage.appendChild(label);
      }
    }
  };

  const makeNode = (node, hiddenCounts, expandableCounts) => {
    const wrap = document.createElement('div');
    wrap.className = 'csw-ft-node-wrap';
    const control = document.createElement(node.published ? 'button' : 'div');
    control.className = 'csw-ft-node' + (node.depth === 0 ? ' is-current' : '') + (node.published ? '' : ' is-unpublished');
    control.dataset.ftNodeKey = node.key;
    control.dataset.ftLineageBoundary = b11NodeBoundary(node);
    if (node.published) {
      control.type = 'button';
      control.dataset.ftNodeId = node.id;
      control.setAttribute('aria-label', node.label + 'の品種詳細を開く');
    }
    if (node.published) {
      const visual = visualFor(node.cultivar);
      if (visual?.src) {
        const img = document.createElement('img');
        img.className = 'csw-ft-thumb';
        img.src = visual.src;
        img.alt = '';
        img.loading = 'lazy';
        control.appendChild(img);
      }
      const copy = document.createElement('span');
      copy.className = 'csw-ft-copy';
      const name = document.createElement('strong');
      name.textContent = node.label;
      copy.appendChild(name);
      if (node.depth === 0) {
        const meta = document.createElement('small');
        meta.textContent = '現在表示中';
        copy.appendChild(meta);
      }
      const boundary = b6NodeState(node);
      if (boundary === 'UNKNOWN' || boundary === 'DISPUTED') {
        const small = document.createElement('small');
        small.className = 'csw-ft-lineage-boundary';
        small.textContent = boundary === 'UNKNOWN' ? '関係情報 未確認' : '関係に異説あり';
        copy.appendChild(small);
      }
      if (node.id === 'do-si-dos' && node.depth > 0 && approvedEvidenceClaim(node.cultivar)) {
        const viewerId = graphState?.nodes?.get(graphState.centerKey)?.id;
        const other = viewerId === 'ogkb' ? 'Face Off OG BX1' : viewerId === 'face-off-og-bx1' ? 'OGKB' : '';
        if (other) { const note=document.createElement('small');note.className='csw-ft-combination-note';note.textContent='この子のもう一方の親: '+other;copy.appendChild(note); }
      }
      control.appendChild(copy);
    } else {
      const name = document.createElement('strong');
      const note = document.createElement('small');
      note.className = 'csw-ft-lineage-boundary';
      note.textContent = b11UnresolvedNote(node);
      name.textContent = node.label;
      control.appendChild(name);
      control.appendChild(note);
    }
    wrap.appendChild(control);
    // Owner STEP07: no secondary detail button; the photo/name card itself opens detail.
    // Owner-approved: one provenance entry attached to the CHILD (the entire parent set), never both parents.
    if (evidenceClaim && node.depth === 0 && node.id === centerId) {
      const evidence = document.createElement('button');
      evidence.type = 'button';
      evidence.className = 'csw-ft-evidence-button';
      evidence.dataset.ftEvidenceClaim = evidenceClaim.id;
      evidence.dataset.ftEvidenceGroup = 'do-si-dos-direct-parent-set';
      evidence.textContent = '親の組み合わせの根拠';
      evidence.setAttribute('aria-label', 'Do-Si-Dosの親OGKBとFace Off OG BX1の組み合わせの根拠を見る');
      wrap.appendChild(evidence);
    }
    for (const direction of ['up', 'down']) {
      const token = direction + ':' + node.key;
      const count = hiddenCounts.get(token) || 0;
      if (!count && !(expanded.has(token) && expandableCounts.has(token))) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'csw-ft-expand';
      if (expanded.has(token)) {
        button.dataset.ftCollapse = token;
        button.textContent = '折りたたむ';
        button.setAttribute('aria-label', node.label + 'の枝を折りたたむ');
      } else {
        button.dataset.ftExpand = token;
        button.textContent = 'さらに' + count + '件';
        button.setAttribute('aria-label', node.label + 'の枝をさらに' + count + '件表示');
      }
      wrap.appendChild(button);
    }
    return wrap;
  };

  // Filter presentation only. Graph nodes, edges, admission and B3b IDs are immutable.
  const filterDirectionView = (view, mode) => {
    if (mode === 'all') return view;
    const accept = mode === 'ancestors' ? node => node.depth <= 0 : node => node.depth >= 0;
    const nodes = view.nodes.filter(accept);
    const keys = new Set(nodes.map(node => node.key));
    const edges = view.edges.filter(edge => keys.has(edge.from) && keys.has(edge.to));
    const prefix = mode === 'ancestors' ? 'up:' : 'down:';
    const filtered = map => new Map([...map].filter(([key]) => key.startsWith(prefix)));
    return { nodes, edges, hiddenCounts: filtered(view.hiddenCounts), expandableCounts: filtered(view.expandableCounts) };
  };

  const renderGraph = () => {
    if (!graphState || !stage) return;
    const visible = filterDirectionView(visibleGraph(graphState, expanded), direction);
    const viewSummary = b13ViewSummary(visible,graphState);
    const summaryNode = overlay.querySelector('.csw-ft-status-summary');
    if (summaryNode) summaryNode.textContent = viewSummary.text;
    overlay.querySelectorAll('[data-ft-direction]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.ftDirection === direction));
    });
    const backButton = overlay.querySelector('[data-ft-back-one]');
    if(backButton) backButton.disabled = !(Number(history.state?.[STATE_KEY]?.trailDepth || 0) > 0);
    const shareField = overlay.querySelector('[data-ft-share-url]');
    if(shareField && !shareField.closest('[data-ft-share-panel]').hidden) shareField.value = shareUrl();
    stage.replaceChildren();
    const depths = [-2, -1, 0, 1, 2];
    const levelLabels = new Map([
      [-2, '祖先（2世代前）'],
      [-1, '親'],
      [0, '現在'],
      [1, '子・派生'],
      [2, '子・派生（2世代先）']
    ]);
    for (const depth of depths) {
      const items = visible.nodes
        .filter(node => node.depth === depth)
        .sort((a, b) => a.order - b.order);
      if (!items.length) continue;
      const level = document.createElement('div');
      level.className = 'csw-ft-level';
      level.dataset.depth = String(depth);
      const levelLabel = levelLabels.get(depth) || '';
      level.dataset.levelLabel = levelLabel;
      if (levelLabel) level.setAttribute('aria-label', levelLabel);
      items.forEach(node => level.appendChild(makeNode(node, visible.hiddenCounts, visible.expandableCounts)));
      stage.appendChild(level);
    }
    requestAnimationFrame(() => {
      drawEdges(visible);
      syncWorldSize();
      if (restoreScroll) {
        const target = restoreScroll;
        restoreScroll = null;
        let remainingFrames = 3;
        const applyRestoredScroll = () => {
          if (!overlay?.open || !viewport) return;
          viewport.scrollTop = target.scrollTop || 0;
          viewport.scrollLeft = target.scrollLeft || 0;
          remainingFrames -= 1;
          if (remainingFrames > 0) requestAnimationFrame(applyRestoredScroll);
          else persistState();
        };
        applyRestoredScroll();
      } else if (centerOnNextRender) {
        centerOnNextRender = false;
        const center = stage.querySelector('[data-ft-node-key="' + CSS.escape(graphState.centerKey) + '"]');
        if (center && viewport.scrollWidth > viewport.clientWidth) {
          viewport.scrollLeft = Math.max(0, center.offsetLeft + center.offsetWidth / 2 - viewport.clientWidth / 2);
        }
      }
    });
    window.__CSWFamilyTreeViewV1 = {
      status: 'PASS',
      contract: CONTRACT,
      centerId,
      direction,
      nodeCount: visible.nodes.length,
      edgeCount: visible.edges.length,
      formallyAdmittedEdges: visible.edges.filter(e=>b6AdmittedEdge(e,graphState)).length,
      heldDisplayEdges: visible.edges.filter(e=>!b6AdmittedEdge(e,graphState)).length,
      viewBoundaryCounts: viewSummary.counts,
      displayLimitedEdges: viewSummary.hidden,
      relationBoundary:'B6_PRIVATE_EXACT_APPROVAL_ONLY',
      maxDepth: MAX_DEPTH,
      branchLimit: BRANCH_LIMIT,
      directParentsUncapped: true,
      fairAggregateSlots: BRANCH_LIMIT,
      expanded: [...expanded],
      relationTypes: unique(visible.edges.map(edge => edge.relation.type)).sort(),
      unpublishedCount: visible.nodes.filter(node => !node.published).length,
      overflowBranches: [...visible.hiddenCounts.entries()].map(([token, count]) => ({ token, count }))
    };
  };

  const openTree = async (id, saved, returnAnchorId = '') => {
    familyTreeReturnAnchorId = text(returnAnchorId || saved?.returnAnchorId);
    const catalog = await loadCatalog();
    b11RecordCandidates(catalog);
    const center = (catalog?.cultivars || []).find(item => item?.id === id);
    if (!center) return false;
    const graph = buildGraph(catalog, center);
    // B15: an isolated published identity remains explorable; no edges are inferred.
    ensureOverlay();
    if (!overlay.open) lastFocus = document.activeElement;
    closeEvidence();
    evidenceClaim = approvedEvidenceClaim(center);
    centerId = id;
    graphState = graph;
    const panel = overlay.querySelector('[data-ft-share-panel]');
    if (panel) panel.hidden = true;
    expanded = new Set(saved?.expanded || []);
    direction = ['all','ancestors','descendants'].includes(saved?.direction) ? saved.direction : 'all';
    restoreScroll = saved ? { scrollTop: saved.scrollTop || 0, scrollLeft: saved.scrollLeft || 0 } : null;
    centerOnNextRender = !saved;
    overlay.querySelector('.csw-ft-title').textContent = center.name + ' の系譜図';
    if (!overlay.open) overlay.showModal();
    else if (document.getElementById('detail-dialog')?.open) {
      // Browser Back/Forward may bring the native detail dialog above the explorer.
      // Reassert the existing graph modal on top without changing navigation state.
      overlay.close();
      overlay.showModal();
    }
    document.documentElement.classList.add('csw-ft-body-lock');
    document.body.classList.add('csw-ft-body-lock');
    renderGraph();
    persistState();
    overlay.querySelector('.csw-ft-close').focus({ preventScroll: true });
    return true;
  };

  // Only an explicit exploration-center change pushes one history entry.
  // Node identity comes from published catalog IDs, never a name/alias match.
  const switchCenter = async id => {
    if (centerSwitchPending || !overlay?.open || !id || id === centerId) return false;
    centerSwitchPending = true;
    try {
      const catalog = await loadCatalog();
      const target = (catalog?.cultivars || []).find(item => item?.id === id);
      if (!target || id === centerId || !overlay?.open) return false;
      persistState();
      const previous = history.state?.[STATE_KEY] || {};
      const url = new URL(location.href);
      url.searchParams.set('strain', id);
      url.searchParams.delete('direction'); // direction is private navigation state except explicit share links
      url.hash = '';
      const next = { ...history.state };
      delete next[STATE_KEY];
      next[STATE_KEY] = {
        centerId: id, direction, expanded: [], scrollTop: 0, scrollLeft: 0,
        returnAnchorId: familyTreeReturnAnchorId,
        originType: previous.originType || (currentId() ? 'detail' : 'home'),
        originUrl: previous.originUrl || location.href,
        trailDepth: (Number.isSafeInteger(previous.trailDepth) ? previous.trailDepth : 0) + 1
      };
      // All checks precede the push; no event is synthesized, so the underlying
      // detail router cannot close the still-open graph.
      history.pushState(next, '', url);
      const opened = await openTree(id, next[STATE_KEY], familyTreeReturnAnchorId);
      if (!opened) throw Error('B4B_CENTER_OPEN_FAILED_AFTER_PUSH');
      return true;
    } finally {
      centerSwitchPending = false;
    }
  };

  // Explicit detail navigation is separate from recentering a graph node.
  const navigateToNode = id => {
    if (!id || !(graphState?.nodes && [...graphState.nodes.values()].some(n => n.id === id && n.published))) return;
    persistState();
    const url = new URL(location.href);
    url.searchParams.set('strain', id);
    url.searchParams.delete('direction');
    url.hash = '';
    if (id === currentId()) {
      const next = { ...history.state };
      delete next[STATE_KEY];
      history.replaceState(next, '', url);
      closeOverlay(false, false);
      window.dispatchEvent(new PopStateEvent('popstate', { state: next }));
      return;
    }
    const next = { ...history.state };
    delete next[STATE_KEY];
    next[NAV_KEY] = centerId;
    closeOverlay(false, false);
    history.pushState(next, '', url);
    window.dispatchEvent(new PopStateEvent('popstate', { state: next }));
  };

  // Closing an exploration session returns to its original HOME/detail/direct
  // entry without adding a new navigation entry and without reopening the graph.
  const closeTreeToOrigin = () => {
    if (!overlay?.open || exitToOriginPending) return;
    const saved = history.state?.[STATE_KEY];
    const depth = saved?.centerId === centerId && Number.isSafeInteger(saved.trailDepth) ? saved.trailDepth : 0;
    if (depth > 0) {
      exitToOriginPending = true;
      exitReturnAnchorId = familyTreeReturnAnchorId;
      closeOverlay(false, false);
      history.go(-depth);
      return;
    }
    const shouldReturn = Boolean(familyTreeReturnAnchorId);
    closeOverlay(true, false);
    if (shouldReturn) returnToFamilyExplorer();
  };

  const ensureEntry = async () => {
    const id = currentId();
    if (!id) return false;
    const root = currentRoot(id);
    const lineageCard = root?.querySelector('.ucd-lineage') || shell.querySelector('.ucd-lineage');
    const body = lineageCard?.querySelector(':scope > div');
    if (!root || !lineageCard || !body) return false;
    if (body.querySelector('[data-family-tree-entry="v1"]')) return true;
    const catalog = await loadCatalog();
    const cultivar = (catalog?.cultivars || []).find(item => item?.id === id);
    if (!cultivar) return false;
    const graph = buildGraph(catalog, cultivar);
    // B15: show the safe Explorer entry even when the current graph has no edges.
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'csw-ft-entry';
    button.dataset.familyTreeEntry = 'v1';
    button.innerHTML = '<span>系譜図を見る<br><small>FAMILY TREE</small></span>';
    button.addEventListener('click', () => openTree(id, null));
    const evidence = body.querySelector(':scope > .ucd-evidence-row') || lineageCard.querySelector('.ucd-evidence-row');
    if (evidence && evidence.parentElement === body) body.insertBefore(button, evidence);
    else body.appendChild(button);
    root.dataset.familyTreeViewV1 = 'ready';
    return true;
  };

  const restoreFromHistory = () => {
    if (exitToOriginPending) return;
    const saved = history.state?.[STATE_KEY];
    const urlId = currentId();
    if (!saved || !saved.centerId || (urlId && saved.centerId !== urlId) ||
        (!urlId && saved.originType !== 'home')) {
      if (overlay?.open) closeOverlay(false, false);
      const requested = new URL(location.href).searchParams.get('direction');
      if (!saved && urlId && ['all','ancestors','descendants'].includes(requested)) {
        // A shared URL has no private history, scroll, expansion or session data.
        setTimeout(() => {
          if (currentId() === urlId && !history.state?.[STATE_KEY]) {
            openTree(urlId,{centerId:urlId,direction:requested,originType:'direct',originUrl:location.href,trailDepth:0,expanded:[],scrollTop:0,scrollLeft:0}).catch(failClosed);
          }
        },0);
      }
      return;
    }
    const id = saved.centerId;
    setTimeout(() => {
      if (!exitToOriginPending && history.state?.[STATE_KEY]?.centerId === id &&
          (!currentId() || currentId() === id)) {
        openTree(id, history.state[STATE_KEY], saved.returnAnchorId).catch(failClosed);
      }
    }, 0);
  };

  const failClosed = error => {
    window.__CSWFamilyTreeViewV1 = {
      status: 'FAIL_CLOSED',
      contract: CONTRACT,
      cultivarId: currentId(),
      error: String(error?.message || error)
    };
    console.error(CONTRACT, error);
  };

  injectStyles();
  ensureOverlay();
  // B7 local-only: detail modal may open after a direct-share explorer.
  new MutationObserver(records => {
    if (!records.some(r => r.target?.id === 'detail-dialog' && r.attributeName === 'open')) return;
    if (overlay?.open && document.getElementById('detail-dialog')?.open) {
      overlay.close();
      overlay.showModal();
    }
  }).observe(document.body, {subtree:true,attributes:true,attributeFilter:['open']});
  ensureFamilyExplorer();
  bindHomeFamilyEntry();
  let queued = false;
  const schedule = () => {
    bindHomeFamilyEntry();
    if (queued || !currentId()) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      ensureEntry().catch(failClosed);
    });
  };

  window.__CSWDetailShellObserverHubV1?.register(schedule);
  shell.addEventListener('click', schedule, true);
  window.addEventListener('popstate', () => {
    if (exitToOriginPending) {
      exitToOriginPending = false;
      const anchor = exitReturnAnchorId;
      exitReturnAnchorId = '';
      clearStoredState();
      familyTreeReturnAnchorId = anchor;
      if (anchor) returnToFamilyExplorer();
      schedule();
      return;
    }
    schedule();
    restoreFromHistory();
  });
  window.addEventListener('resize', () => {
    if (overlay && overlay.open && graphState) renderGraph();
  }, { passive: true });
  schedule();
  setTimeout(schedule, 250);
  setTimeout(schedule, 1000);
  restoreFromHistory();
})();