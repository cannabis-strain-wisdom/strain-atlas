(() => {
  'use strict';

  const CONTRACT = 'CSW_FAMILY_TREE_VIEW_V1';
  const STATE_KEY = '__cswFamilyTreeV1';
  const NAV_KEY = '__cswFamilyTreeFrom';
  const MAX_DEPTH = 2;
  const BRANCH_LIMIT = 3;
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
    ['face off og>face-off-og-bx1', { type: 'bx', label: 'BX', guard: /backcross family/i }],
    ['sunset sherbert>gelato-33', { type: 'selected-phenotype', label: 'selected phenotype', guard: /pheno-hunt|keeper|選抜個体/i }],
    ['thin mint gsc>gelato-33', { type: 'selected-phenotype', label: 'selected phenotype', guard: /pheno-hunt|keeper|選抜個体/i }],
    ['triangle kush>wedding-cake', { type: 'selected-phenotype', label: 'selected phenotype', guard: /選抜個体/i }],
    ['animal mints>wedding-cake', { type: 'selected-phenotype', label: 'selected phenotype', guard: /選抜個体/i }],
    ['chem d>gmo-cookies', { type: 'selected-line', label: 'selected line', guard: /選抜された/i }],
    ['forum gsc>gmo-cookies', { type: 'selected-line', label: 'selected line', guard: /選抜された/i }],
    ['pink guava>rainbow-sherbert-11', { type: 'selected-phenotype', label: 'selected phenotype', guard: /#11.*選抜|選抜.*#11/i }],
    ['sunset sherbert>rainbow-sherbert-11', { type: 'selected-phenotype', label: 'selected phenotype', guard: /#11.*選抜|選抜.*#11/i }],
    ['black cherry punch>super-boof', { type: 'selected-phenotype', label: 'selected phenotype', guard: /選抜した個体/i }],
    ['tropicana cookies>super-boof', { type: 'selected-phenotype', label: 'selected phenotype', guard: /選抜した個体/i }],
    ['gelato 33>lemon-cherry-gelato', { type: 'other', label: 'bagseed', guard: /bagseed/i }]
  ]);

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
      const parentKeys = confirmedParents(child).map(normalize);
      const lineageText = text(child?.lineage?.presentation?.textJa);
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
    if (parentCultivar && selectionRelationship(parentCultivar, childCultivar?.id)) {
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

    const addNode = (label, cultivar, depth) => {
      const key = nodeKey(label, cultivar);
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
          const parentNode = addNode(parentLabel, parentCultivar, -(entry.distance + 1));
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
          .slice()
          .sort((a, b) => String(a.child.name).localeCompare(String(b.child.name), 'en'));
        for (const childEntry of children) {
          const childNode = addNode(childEntry.child.name, childEntry.child, entry.distance + 1);
          addEdge(entry.node, childNode, relationFor(childEntry.parentLabel, entry.item, childEntry.child));
          next.push({ item: childEntry.child, node: childNode, distance: entry.distance + 1 });
        }
      }
      downstreamFrontier = next;
    }

    return { centerKey: centerNode.key, nodes, edges: [...edges.values()] };
  };

  const visibleGraph = (graph, expanded) => {
    const incoming = new Map();
    const outgoing = new Map();
    for (const edge of graph.edges) {
      const inList = incoming.get(edge.to) || [];
      inList.push(edge);
      incoming.set(edge.to, inList);
      const outList = outgoing.get(edge.from) || [];
      outList.push(edge);
      outgoing.set(edge.from, outList);
    }

    const visibleKeys = new Set([graph.centerKey]);
    const visibleEdges = [];
    const hiddenCounts = new Map();

    const walkUp = (key, depth) => {
      if (depth >= MAX_DEPTH) return;
      const all = (incoming.get(key) || []).slice().sort((a, b) => graph.nodes.get(a.from).order - graph.nodes.get(b.from).order);
      const token = 'up:' + key;
      const shown = expanded.has(token) ? all : all.slice(0, BRANCH_LIMIT);
      if (all.length > shown.length) hiddenCounts.set(token, all.length - shown.length);
      for (const edge of shown) {
        visibleEdges.push(edge);
        visibleKeys.add(edge.from);
        walkUp(edge.from, depth + 1);
      }
    };

    const walkDown = (key, depth) => {
      if (depth >= MAX_DEPTH) return;
      const all = (outgoing.get(key) || []).slice().sort((a, b) => graph.nodes.get(a.to).order - graph.nodes.get(b.to).order);
      const token = 'down:' + key;
      const shown = expanded.has(token) ? all : all.slice(0, BRANCH_LIMIT);
      if (all.length > shown.length) hiddenCounts.set(token, all.length - shown.length);
      for (const edge of shown) {
        visibleEdges.push(edge);
        visibleKeys.add(edge.to);
        walkDown(edge.to, depth + 1);
      }
    };

    walkUp(graph.centerKey, 0);
    walkDown(graph.centerKey, 0);

    return {
      nodes: [...visibleKeys].map(key => graph.nodes.get(key)).filter(Boolean),
      edges: [...new Map(visibleEdges.map(edge => [edge.key, edge])).values()],
      hiddenCounts
    };
  };

  let overlay;
  let viewport;
  let stage;
  let graphState = null;
  let expanded = new Set();
  let centerId = '';
  let restoreScroll = null;
  let lastFocus = null;

  const ensureOverlay = () => {
    if (overlay) return overlay;
    overlay = document.createElement('section');
    overlay.className = 'csw-family-tree-v1';
    overlay.hidden = true;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '家系図ビュー');
    overlay.innerHTML = '<header class="csw-ft-header"><button type="button" class="csw-ft-close" aria-label="家系図を閉じる">←</button><div><small>FAMILY TREE</small><strong class="csw-ft-title">家系図</strong></div><span class="csw-ft-depth">上下2世代</span></header><div class="csw-ft-viewport" tabindex="0"><div class="csw-ft-stage"></div></div><footer class="csw-ft-footer">確認済みの系譜だけを表示。線のラベルで parent / selected cut / selected phenotype / selected line / S1 / BX / bagseed などの意味を区別します。</footer>';
    document.body.appendChild(overlay);
    viewport = overlay.querySelector('.csw-ft-viewport');
    stage = overlay.querySelector('.csw-ft-stage');
    overlay.querySelector('.csw-ft-close').addEventListener('click', () => closeOverlay(true));
    overlay.addEventListener('click', event => {
      const expandButton = event.target.closest('[data-ft-expand]');
      if (expandButton) {
        expanded.add(expandButton.dataset.ftExpand);
        persistState();
        renderGraph();
        return;
      }
      const nodeButton = event.target.closest('[data-ft-node-id]');
      if (nodeButton) navigateToNode(nodeButton.dataset.ftNodeId);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && overlay && !overlay.hidden) closeOverlay(true);
    });
    return overlay;
  };

  const injectStyles = () => {
    if (document.getElementById('csw-family-tree-v1-style')) return;
    const style = document.createElement('style');
    style.id = 'csw-family-tree-v1-style';
    style.textContent = '.csw-ft-entry{display:flex;width:100%;min-height:44px;align-items:center;justify-content:space-between;gap:10px;margin:12px 0 2px;padding:10px 12px;border:1px solid rgba(216,189,98,.2);border-radius:12px;background:linear-gradient(135deg,rgba(216,189,98,.08),rgba(255,255,255,.018));color:#e6d58f;font:800 12px/1.2 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:left}.csw-ft-entry small{color:#7f9187;font-size:9px;font-weight:800;letter-spacing:.1em}.csw-ft-entry:after{content:"›";font-size:20px;color:#b9a257}.csw-family-tree-v1{position:fixed;inset:0;z-index:999;background:#06100c;color:#edf1e9;display:grid;grid-template-rows:auto minmax(0,1fr) auto}.csw-family-tree-v1[hidden]{display:none}.csw-ft-header{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:10px;padding:max(10px,env(safe-area-inset-top)) 12px 10px;border-bottom:1px solid rgba(216,189,98,.16);background:rgba(4,12,8,.98)}.csw-ft-close{width:44px;height:44px;border:1px solid rgba(255,255,255,.1);border-radius:50%;background:rgba(255,255,255,.025);color:#edf1e9;font-size:22px}.csw-ft-header>div{display:grid;gap:2px}.csw-ft-header small{color:#d8bd62;font-size:9px;font-weight:900;letter-spacing:.13em}.csw-ft-title{font-size:16px;line-height:1.2}.csw-ft-depth{color:#829087;font-size:9px;font-weight:750}.csw-ft-viewport{position:relative;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:22px 16px 40px}.csw-ft-stage{position:relative;display:grid;gap:62px;min-width:max-content;min-height:100%;padding:12px 18px 32px}.csw-ft-level{position:relative;z-index:2;display:flex;justify-content:center;align-items:center;gap:18px;min-height:92px}.csw-ft-level[data-depth="0"]{min-height:108px}.csw-ft-node-wrap{display:grid;justify-items:center;gap:7px;width:138px}.csw-ft-node{display:grid;width:138px;min-height:72px;grid-template-columns:36px minmax(0,1fr);align-items:center;gap:8px;padding:8px;border:1px solid rgba(255,255,255,.12);border-radius:13px;background:#0a1711;color:#edf1e9;text-align:left;box-shadow:0 10px 26px rgba(0,0,0,.2)}.csw-ft-node.is-current{border-color:rgba(216,189,98,.62);background:linear-gradient(145deg,rgba(216,189,98,.16),rgba(43,86,56,.28))}.csw-ft-node.is-unpublished{display:flex;justify-content:center;min-height:58px;background:rgba(255,255,255,.018);border-style:dashed;color:#9baa9f;text-align:center}.csw-ft-thumb{width:36px;height:36px;border-radius:9px;object-fit:cover;background:#111}.csw-ft-copy{display:grid;gap:3px;min-width:0}.csw-ft-copy strong{font-size:11.5px;line-height:1.25;overflow-wrap:anywhere}.csw-ft-copy small{color:#84958b;font-size:7.5px;font-weight:850;letter-spacing:.08em}.csw-ft-expand{min-height:28px;padding:4px 8px;border:1px solid rgba(216,189,98,.17);border-radius:999px;background:rgba(216,189,98,.04);color:#bdaa6b;font-size:9px;font-weight:800}.csw-ft-svg{position:absolute;inset:0;z-index:1;overflow:visible;pointer-events:none}.csw-ft-svg path{fill:none;stroke:rgba(216,189,98,.42);stroke-width:1.25;stroke-linecap:round}.csw-ft-svg path.is-selected-cut,.csw-ft-svg path.is-selection,.csw-ft-svg path.is-selected-phenotype,.csw-ft-svg path.is-selected-line,.csw-ft-svg path.is-other{stroke-dasharray:4 4}.csw-ft-svg path.is-s1,.csw-ft-svg path.is-bx{stroke-width:1.7}.csw-ft-edge-label{position:absolute;z-index:3;transform:translate(-50%,-50%);padding:2px 5px;border:1px solid rgba(216,189,98,.16);border-radius:999px;background:#07120d;color:#aab7af;font-size:7.5px;font-weight:850;line-height:1.1;white-space:nowrap;pointer-events:none}.csw-ft-footer{padding:10px 14px max(10px,env(safe-area-inset-bottom));border-top:1px solid rgba(216,189,98,.12);background:rgba(4,12,8,.98);color:#7f9187;font-size:9px;line-height:1.5}.csw-ft-body-lock{overflow:hidden!important}@media(max-width:390px){.csw-ft-viewport{padding-inline:10px}.csw-ft-stage{gap:56px;padding-inline:10px}.csw-ft-level{gap:12px}.csw-ft-node-wrap,.csw-ft-node{width:126px}.csw-ft-node{grid-template-columns:32px minmax(0,1fr);min-height:68px;padding:7px}.csw-ft-thumb{width:32px;height:32px}.csw-ft-copy strong{font-size:11px}.csw-ft-edge-label{font-size:7px}}';
    document.head.appendChild(style);
  };

  const persistState = () => {
    if (!centerId || !overlay || overlay.hidden) return;
    const next = { ...history.state, [STATE_KEY]: {
      centerId,
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

  const closeOverlay = clear => {
    if (!overlay || overlay.hidden) return;
    if (!clear) persistState();
    overlay.hidden = true;
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
    stage.prepend(svg);
    const stageRect = stage.getBoundingClientRect();
    for (const edge of visible.edges) {
      const from = stage.querySelector('[data-ft-node-key="' + CSS.escape(edge.from) + '"]');
      const to = stage.querySelector('[data-ft-node-key="' + CSS.escape(edge.to) + '"]');
      if (!from || !to) continue;
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const upward = b.top < a.top;
      const x1 = a.left - stageRect.left + a.width / 2;
      const y1 = upward ? a.top - stageRect.top : a.bottom - stageRect.top;
      const x2 = b.left - stageRect.left + b.width / 2;
      const y2 = upward ? b.bottom - stageRect.top : b.top - stageRect.top;
      const mid = (y1 + y2) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + mid + ', ' + x2 + ' ' + mid + ', ' + x2 + ' ' + y2);
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      path.classList.add('is-' + edge.relation.type);
      svg.appendChild(path);
      const label = document.createElement('span');
      label.className = 'csw-ft-edge-label';
      label.textContent = edge.relation.label;
      label.style.left = ((x1 + x2) / 2) + 'px';
      label.style.top = mid + 'px';
      stage.appendChild(label);
    }
  };

  const makeNode = (node, hiddenCounts) => {
    const wrap = document.createElement('div');
    wrap.className = 'csw-ft-node-wrap';
    const control = document.createElement(node.published ? 'button' : 'div');
    control.className = 'csw-ft-node' + (node.depth === 0 ? ' is-current' : '') + (node.published ? '' : ' is-unpublished');
    control.dataset.ftNodeKey = node.key;
    if (node.published && node.depth !== 0) {
      control.type = 'button';
      control.dataset.ftNodeId = node.id;
      control.setAttribute('aria-label', node.label + 'の詳細へ移動');
    } else if (node.published) {
      control.type = 'button';
      control.disabled = true;
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
      const meta = document.createElement('small');
      meta.textContent = node.depth === 0 ? 'CURRENT' : 'CSW';
      copy.append(name, meta);
      control.appendChild(copy);
    } else {
      const name = document.createElement('strong');
      name.textContent = node.label;
      control.appendChild(name);
    }
    wrap.appendChild(control);
    for (const direction of ['up', 'down']) {
      const token = direction + ':' + node.key;
      const count = hiddenCounts.get(token) || 0;
      if (!count) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'csw-ft-expand';
      button.dataset.ftExpand = token;
      button.textContent = 'さらに' + count + '件';
      wrap.appendChild(button);
    }
    return wrap;
  };

  const renderGraph = () => {
    if (!graphState || !stage) return;
    const visible = visibleGraph(graphState, expanded);
    stage.replaceChildren();
    const depths = [-2, -1, 0, 1, 2];
    for (const depth of depths) {
      const items = visible.nodes
        .filter(node => node.depth === depth)
        .sort((a, b) => a.order - b.order);
      if (!items.length) continue;
      const level = document.createElement('div');
      level.className = 'csw-ft-level';
      level.dataset.depth = String(depth);
      items.forEach(node => level.appendChild(makeNode(node, visible.hiddenCounts)));
      stage.appendChild(level);
    }
    requestAnimationFrame(() => {
      drawEdges(visible);
      if (restoreScroll) {
        viewport.scrollTop = restoreScroll.scrollTop || 0;
        viewport.scrollLeft = restoreScroll.scrollLeft || 0;
        restoreScroll = null;
      } else {
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
      nodeCount: visible.nodes.length,
      edgeCount: visible.edges.length,
      maxDepth: MAX_DEPTH,
      branchLimit: BRANCH_LIMIT,
      expanded: [...expanded],
      relationTypes: unique(visible.edges.map(edge => edge.relation.type)).sort(),
      unpublishedCount: visible.nodes.filter(node => !node.published).length,
      overflowBranches: [...visible.hiddenCounts.entries()].map(([token, count]) => ({ token, count }))
    };
  };

  const openTree = async (id, saved) => {
    const catalog = await loadCatalog();
    const center = (catalog?.cultivars || []).find(item => item?.id === id);
    if (!center) return false;
    const graph = buildGraph(catalog, center);
    if (!graph.edges.length) return false;
    ensureOverlay();
    lastFocus = document.activeElement;
    centerId = id;
    graphState = graph;
    expanded = new Set(saved?.expanded || []);
    restoreScroll = saved ? { scrollTop: saved.scrollTop || 0, scrollLeft: saved.scrollLeft || 0 } : null;
    overlay.querySelector('.csw-ft-title').textContent = center.name + ' の家系図';
    overlay.hidden = false;
    document.documentElement.classList.add('csw-ft-body-lock');
    document.body.classList.add('csw-ft-body-lock');
    renderGraph();
    persistState();
    overlay.querySelector('.csw-ft-close').focus({ preventScroll: true });
    return true;
  };

  const navigateToNode = id => {
    if (!id || id === centerId) return;
    persistState();
    const url = new URL(location.href);
    url.searchParams.set('strain', id);
    url.hash = '';
    const next = { ...history.state };
    delete next[STATE_KEY];
    next[NAV_KEY] = centerId;
    closeOverlay(false);
    history.pushState(next, '', url);
    window.dispatchEvent(new PopStateEvent('popstate', { state: next }));
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
    if (!graph.edges.length) return false;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'csw-ft-entry';
    button.dataset.familyTreeEntry = 'v1';
    button.innerHTML = '<span>家系図を見る<br><small>FAMILY TREE</small></span>';
    button.addEventListener('click', () => openTree(id, null));
    const evidence = body.querySelector(':scope > .ucd-evidence-row') || lineageCard.querySelector('.ucd-evidence-row');
    if (evidence && evidence.parentElement === body) body.insertBefore(button, evidence);
    else body.appendChild(button);
    root.dataset.familyTreeViewV1 = 'ready';
    return true;
  };

  const restoreFromHistory = () => {
    const saved = history.state?.[STATE_KEY];
    const id = currentId();
    if (!saved || !id || saved.centerId !== id) return;
    setTimeout(() => openTree(id, saved).catch(failClosed), 0);
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
  let queued = false;
  const schedule = () => {
    if (queued || !currentId()) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      ensureEntry().catch(failClosed);
    });
  };

  new MutationObserver(schedule).observe(shell, { childList: true, subtree: true });
  shell.addEventListener('click', schedule, true);
  window.addEventListener('popstate', () => {
    schedule();
    restoreFromHistory();
  });
  window.addEventListener('resize', () => {
    if (overlay && !overlay.hidden && graphState) renderGraph();
  }, { passive: true });
  schedule();
  setTimeout(schedule, 250);
  setTimeout(schedule, 1000);
  restoreFromHistory();
})();