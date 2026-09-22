(() => {
  'use strict';

  const CONTRACT = 'CSW_LINEAGE_MAP_V1';
  const MAX_DEPTH = 3;
  const shell = document.getElementById('detail-shell');
  if (!shell) return;

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

  const text = value => typeof value === 'string' ? value.trim() : '';
  const normalizeName = value => String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  const buildResolver = catalog => {
    const index = new Map();
    for (const cultivar of catalog?.cultivars || []) {
      const keys = [cultivar?.id, cultivar?.name, ...(cultivar?.aliases || [])];
      for (const raw of keys) {
        const key = normalizeName(raw);
        if (!key) continue;
        const bucket = index.get(key) || [];
        if (!bucket.some(item => item.id === cultivar.id)) bucket.push(cultivar);
        index.set(key, bucket);
      }
    }
    return label => {
      const matches = index.get(normalizeName(label)) || [];
      return matches.length === 1 ? matches[0] : null;
    };
  };

  const confirmedParents = cultivar => {
    const lineage = cultivar?.lineage;
    if (!lineage || lineage.status !== 'confirmed') return [];
    return Array.isArray(lineage.parents) ? lineage.parents.map(text).filter(Boolean) : [];
  };

  const buildGraph = (rootCultivar, resolve) => {
    let serial = 0;
    const edges = [];
    const make = (label, cultivar, depth, pathIds, isRoot = false) => {
      const key = `n${serial++}`;
      const nextPath = new Set(pathIds);
      if (cultivar?.id) nextPath.add(cultivar.id);
      const node = {
        key,
        label: text(label) || text(cultivar?.name) || 'Unknown',
        cultivar,
        isRoot,
        parents: []
      };
      if (depth >= MAX_DEPTH || !cultivar) return node;

      for (const parentLabel of confirmedParents(cultivar)) {
        const resolved = resolve(parentLabel);
        const cycle = Boolean(resolved?.id && nextPath.has(resolved.id));
        const parent = make(parentLabel, cycle ? null : resolved, depth + 1, nextPath, false);
        parent.cycle = cycle;
        node.parents.push(parent);
        edges.push({ from: parent.key, to: node.key });
      }
      return node;
    };

    return {
      root: make(rootCultivar?.name, rootCultivar, 0, new Set(), true),
      edges
    };
  };

  const strainHref = cultivarId => {
    const url = new URL(location.href);
    url.searchParams.set('strain', cultivarId);
    url.hash = '';
    return `${url.pathname}${url.search}`;
  };

  const nodeElement = node => {
    const resolved = node.cultivar && !node.isRoot;
    const element = document.createElement(resolved ? 'a' : 'div');
    element.className = `csw-lineage-map-node${node.isRoot ? ' is-root' : ''}${resolved ? ' is-linked' : ''}${node.cycle ? ' is-cycle' : ''}`;
    element.dataset.lineageNodeKey = node.key;
    if (resolved) {
      element.href = strainHref(node.cultivar.id);
      element.setAttribute('aria-label', `${node.label}の詳細を見る`);
    }

    const name = document.createElement('strong');
    name.textContent = node.label;
    element.append(name);

    const meta = document.createElement('small');
    if (node.isRoot) meta.textContent = 'CURRENT';
    else if (resolved) meta.textContent = 'CSW';
    else meta.textContent = 'PARENT';
    element.append(meta);
    return element;
  };

  const renderBranch = node => {
    const branch = document.createElement('div');
    branch.className = 'csw-lineage-map-branch';

    if (node.parents.length) {
      const parents = document.createElement('div');
      parents.className = 'csw-lineage-map-parents';
      for (const parent of node.parents) parents.append(renderBranch(parent));
      branch.append(parents);
    }

    branch.append(nodeElement(node));
    return branch;
  };

  const makeMap = (cultivar, catalog) => {
    const resolve = buildResolver(catalog);
    const graph = buildGraph(cultivar, resolve);
    if (!graph.root.parents.length) return null;

    const section = document.createElement('section');
    section.className = 'csw-lineage-map-v1';
    section.dataset.lineageMapV1 = cultivar.id;

    const heading = document.createElement('div');
    heading.className = 'csw-lineage-map-heading';
    heading.innerHTML = '<span>LINEAGE MAP / 系統図</span><small>確認済みの親子関係のみ</small>';
    section.append(heading);

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
    tree.append(renderBranch(graph.root));
    inner.append(svg, tree);
    viewport.append(inner);
    section.append(viewport);

    const note = document.createElement('p');
    note.className = 'csw-lineage-map-note';
    note.textContent = '現在のCSWで確認済みのdirect parentだけを線で接続。名称や系統イメージだけでは推測接続しません。';
    section.append(note);

    const drawEdges = () => {
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
        const x1 = a.left - innerRect.left + a.width / 2 + inner.scrollLeft;
        const y1 = a.bottom - innerRect.top + inner.scrollTop;
        const x2 = b.left - innerRect.left + b.width / 2 + inner.scrollLeft;
        const y2 = b.top - innerRect.top + inner.scrollTop;
        const mid = y1 + Math.max(14, (y2 - y1) * 0.5);
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`);
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        svg.append(path);
      }
    };

    let centered = false;
    const layout = () => requestAnimationFrame(() => {
      drawEdges();
      if (!centered && viewport.clientWidth > 0 && inner.scrollWidth > viewport.clientWidth) {
        viewport.scrollLeft = Math.max(0, (inner.scrollWidth - viewport.clientWidth) / 2);
        centered = true;
      }
    });

    section.__cswLineageMapLayout = layout;
    return section;
  };

  const decorate = async () => {
    const id = new URL(location.href).searchParams.get('strain');
    if (!id) return;
    const root = shell.querySelector(`.ucd-root[data-public-detail-id="${CSS.escape(id)}"]`);
    const lineage = shell.querySelector('.ucd-lineage');
    if (!root || !lineage || lineage.dataset.lineageMapV1 === 'ready') return;

    const catalog = await loadCatalog();
    const cultivar = (catalog?.cultivars || []).find(item => item?.id === id);
    if (!cultivar || !confirmedParents(cultivar).length) return;

    const map = makeMap(cultivar, catalog);
    if (!map) return;

    let body = lineage.querySelector(':scope > div');
    if (!body) {
      body = document.createElement('div');
      lineage.append(body);
    }
    body.prepend(map);
    lineage.dataset.lineageMapV1 = 'ready';
    root.dataset.lineageMapV1 = 'ready';

    const layout = map.__cswLineageMapLayout;
    const runLayout = () => typeof layout === 'function' && layout();
    lineage.addEventListener('toggle', () => {
      if (lineage.open) runLayout();
    });
    window.addEventListener('resize', runLayout, { passive: true });
    if (lineage.open) runLayout();

    window.__CSWLineageMapV1 = {
      status: 'PASS',
      contract: CONTRACT,
      cultivarId: cultivar.id,
      directParents: confirmedParents(cultivar).length,
      edges: map.querySelectorAll('.csw-lineage-map-node').length - 1,
      maxDepth: MAX_DEPTH
    };
  };

  if (!document.getElementById('csw-lineage-map-v1-style')) {
    const style = document.createElement('style');
    style.id = 'csw-lineage-map-v1-style';
    style.textContent = `
      .csw-lineage-map-v1{margin:4px 0 14px;padding:12px 0 2px;border-bottom:1px solid rgba(255,255,255,.06)}
      .csw-lineage-map-heading{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:0 2px 10px}
      .csw-lineage-map-heading span{color:#d8bd62;font-size:10px;font-weight:900;letter-spacing:.09em}
      .csw-lineage-map-heading small{color:#8f9d95;font-size:9px;font-weight:700;white-space:nowrap}
      .csw-lineage-map-viewport{max-width:100%;overflow-x:auto;overflow-y:hidden;padding:8px 10px 12px;border:1px solid rgba(217,182,93,.12);border-radius:14px;background:linear-gradient(180deg,rgba(217,182,93,.035),rgba(255,255,255,.018));scrollbar-width:thin;overscroll-behavior-inline:contain;-webkit-overflow-scrolling:touch}
      .csw-lineage-map-inner{position:relative;display:inline-block;min-width:100%;padding:10px 14px 8px}
      .csw-lineage-map-tree{position:relative;z-index:2;display:flex;justify-content:center;min-width:max-content}
      .csw-lineage-map-branch{display:flex;flex:0 0 auto;flex-direction:column;align-items:center;justify-content:flex-end;gap:24px;min-width:134px;padding:0 5px}
      .csw-lineage-map-parents{display:flex;align-items:flex-end;justify-content:center;gap:8px}
      .csw-lineage-map-node{position:relative;z-index:2;display:flex;width:124px;min-height:52px;padding:9px 8px 7px;flex-direction:column;align-items:center;justify-content:center;gap:4px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#0a1711;color:#edf1e9;text-align:center;text-decoration:none;box-shadow:0 8px 24px rgba(0,0,0,.16)}
      .csw-lineage-map-node strong{display:block;max-width:100%;font-size:11.5px;line-height:1.28;overflow-wrap:anywhere}
      .csw-lineage-map-node small{color:#86978d;font-size:7px;font-weight:850;letter-spacing:.12em}
      .csw-lineage-map-node.is-root{border-color:rgba(217,182,93,.62);background:linear-gradient(145deg,rgba(217,182,93,.17),rgba(35,74,48,.34));color:#fff8df;box-shadow:0 10px 28px rgba(0,0,0,.22),inset 0 1px 0 rgba(255,255,255,.045)}
      .csw-lineage-map-node.is-root small{color:#d8bd62}
      .csw-lineage-map-node.is-linked{border-color:rgba(105,169,120,.32);background:linear-gradient(145deg,rgba(105,169,120,.09),rgba(255,255,255,.02))}
      .csw-lineage-map-node.is-linked small{color:#92b79a}
      .csw-lineage-map-node.is-linked:active{transform:scale(.985)}
      .csw-lineage-map-edges{position:absolute;inset:0;z-index:1;overflow:visible;pointer-events:none}
      .csw-lineage-map-edges path{fill:none;stroke:rgba(217,182,93,.48);stroke-width:1.35;stroke-linecap:round}
      .csw-lineage-map-note{margin:9px 2px 0!important;color:#8f9d95!important;font-size:10px!important;line-height:1.55!important}
      @media(max-width:699px){
        .csw-lineage-map-v1{margin-top:2px}
        .csw-lineage-map-heading{align-items:flex-start;flex-direction:column;gap:3px}
        .csw-lineage-map-heading span{font-size:10.5px}
        .csw-lineage-map-heading small{font-size:9.5px}
        .csw-lineage-map-viewport{padding:7px 6px 11px}
        .csw-lineage-map-inner{padding-inline:10px}
        .csw-lineage-map-branch{min-width:126px;padding-inline:4px}
        .csw-lineage-map-node{width:116px;min-height:50px;padding:8px 7px 6px}
        .csw-lineage-map-node strong{font-size:11px}
        .csw-lineage-map-note{font-size:10.5px!important}
      }
      @media(prefers-reduced-motion:reduce){.csw-lineage-map-node.is-linked:active{transform:none}}
    `;
    document.head.appendChild(style);
  }

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      decorate().catch(error => {
        window.__CSWLineageMapV1 = { status: 'FAIL_CLOSED', contract: CONTRACT, error: String(error?.message || error) };
        console.error(CONTRACT, error);
      });
    });
  };

  new MutationObserver(schedule).observe(shell, { childList: true, subtree: true });
  shell.addEventListener('click', schedule, true);
  window.addEventListener('popstate', schedule);
  schedule();
})();
