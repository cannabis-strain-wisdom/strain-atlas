#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const readArg = (name, required = false) => {
  const prefix = `--${name}=`;
  const hit = args.find(arg => arg.startsWith(prefix));
  if (!hit) {
    if (required) throw new Error(`--${name} is required`);
    return null;
  }
  return hit.slice(prefix.length);
};

const catalogPath = path.resolve(readArg('catalog', true));
const outDir = path.resolve(readArg('out', true));
const siteRoot = (readArg('site-root') || 'https://cannabis-strain-wisdom.github.io/strain-atlas/').replace(/\/+$/, '/') ;
const indexing = readArg('indexing') || 'closed';
const activationToken = readArg('activation-token');

if (!['closed', 'open'].includes(indexing)) throw new Error(`unsupported indexing mode: ${indexing}`);
if (indexing === 'open' && activationToken !== 'SEARCH_INDEXING_OPEN_V1') {
  throw new Error('SEARCH_INDEXING_OPEN_REQUIRES_EXPLICIT_ACTIVATION_TOKEN');
}
if (!/^https:\/\/[^/]+\/.+\/$/.test(siteRoot)) throw new Error(`unexpected site root: ${siteRoot}`);
if (!fs.existsSync(catalogPath)) throw new Error(`catalog missing: ${catalogPath}`);

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
if (!Array.isArray(catalog?.cultivars)) throw new Error('catalog cultivars missing');

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

const cleanText = value => String(value ?? '').replace(/\s+/g, ' ').trim();

const typeLabels = {
  sativa: 'サティバ',
  'sativa-dominant-hybrid': 'サティバ優勢ハイブリッド',
  indica: 'インディカ',
  'indica-dominant-hybrid': 'インディカ優勢ハイブリッド',
  hybrid: 'ハイブリッド',
  'balanced-hybrid': 'バランス型ハイブリッド',
  unknown: '未分類'
};

function aromaTerms(cultivar) {
  const rows = Array.isArray(cultivar?.aromas?.items) ? cultivar.aromas.items : [];
  const terms = [];
  for (const item of rows) {
    if (typeof item === 'string') {
      const value = cleanText(item);
      if (value) terms.push(value);
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    for (const key of ['display', 'label', 'term', 'name', 'ja', 'canonical']) {
      const value = cleanText(item[key]);
      if (value) {
        terms.push(value);
        break;
      }
    }
  }
  return [...new Set(terms)].slice(0, 8);
}

function visualFor(cultivar) {
  const visuals = Array.isArray(cultivar?.visuals) ? cultivar.visuals : [];
  const visual = visuals.find(item => item?.role === 'primary') || visuals[0] || null;
  if (!visual || typeof visual.src !== 'string') return null;
  const src = visual.src.trim();
  if (!/^assets\/cultivars\/[a-z0-9-]+\/[a-z0-9._-]+\.(?:svg|webp|png|jpe?g)$/i.test(src)) return null;
  return { src, alt: cleanText(visual.alt || cultivar.name || '') };
}

function summaryRows(cultivar) {
  const rows = [];
  const type = typeLabels[cultivar?.classification?.type] || cleanText(cultivar?.classification?.type);
  if (type) rows.push(['TYPE', type]);

  const lineage = cleanText(cultivar?.lineage?.display);
  if (lineage) rows.push(['LINEAGE', lineage]);

  const aromas = aromaTerms(cultivar);
  if (aromas.length) rows.push(['AROMA', aromas.join(' / ')]);

  return rows;
}

const proseSections = [
  ['lineageNote', '系譜'], ['origin', '起源'], ['history', '歴史'],
  ['aromaNote', '香り'], ['terpeneNote', 'テルペン'],
  ['morphologyNote', '形態'], ['positioning', '品種の位置づけ']
];

function publicProse(cultivar) {
  const prose = cultivar?.publicContent?.ja || {};
  const sections = proseSections.map(([key, label]) => [label, cleanText(prose[key])]).filter(([, value]) => value);
  // Some published S1 entries have no approved prose yet. State only their
  // confirmed public lineage, without filling unknown aroma/history fields.
  if (!sections.length && cultivar?.lineage?.status === 'confirmed' && cleanText(cultivar.lineage.display)) {
    sections.push(['系譜', `確認された系譜：${cleanText(cultivar.lineage.display)}。`]);
  }
  return sections;
}

function sourceRows(cultivar) {
  const refs = new Set();
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value.sourceRefs)) {
      for (const ref of value.sourceRefs) if (typeof ref === 'string') refs.add(ref);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'publicPresentation' && key !== 'visuals') visit(child);
    }
  };
  visit(cultivar);
  return [...refs].sort().map(ref => {
    const source = catalog.sources?.[ref];
    if (!source) throw new Error(`public source missing: ${cultivar.id}:${ref}`);
    const url = cleanText(source.url);
    if (!/^https:\/\/[^\s<>"']+$/.test(url)) throw new Error(`invalid public source URL: ${cultivar.id}:${ref}`);
    return { publisher: cleanText(source.publisher), title: cleanText(source.title), url };
  });
}

function pageFor(cultivar) {
  const id = cleanText(cultivar?.id);
  const name = cleanText(cultivar?.name);
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`invalid cultivar id: ${id}`);
  if (!name) throw new Error(`missing cultivar name: ${id}`);

  const jp = cleanText(cultivar?.jp);
  const canonical = `${siteRoot}cultivars/${encodeURIComponent(id)}/`;
  const interactive = `${siteRoot}?strain=${encodeURIComponent(id)}`;
  const prose = publicProse(cultivar);
  const description = `${name}：${(prose[0]?.[1] || `${name}の公開情報と出典を掲載しています。`).slice(0, 145)}`;
  const robots = indexing === 'open' ? 'index,follow,max-image-preview:large' : 'noindex,nofollow,noarchive';
  const visual = visualFor(cultivar);
  if (!visual) throw new Error(`cultivar image missing: ${id}`);
  // SVGs remain in the page body, but crawlers receive the WebP rendered by
  // the Pages build. Both paths live under the existing public asset boundary.
  const shareImage = visual.src.toLowerCase().endsWith('.svg')
    ? `assets/cultivars/${id}/share.webp` : visual.src;
  if (!fs.existsSync(path.join(outDir, shareImage))) throw new Error(`share image missing: ${id}:${shareImage}`);
  const imageUrl = new URL(shareImage, siteRoot).href;
  const rows = summaryRows(cultivar);
  const sources = sourceRows(cultivar);
  const rowsHtml = rows.length
    ? `<dl class="facts">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`
    : '<p class="muted">公開情報を整理中です。</p>';
  const visualHtml = visual
    ? `<figure><img src="../../${escapeHtml(visual.src)}" alt="${escapeHtml(visual.alt)}" loading="eager" decoding="async"></figure>`
    : '';
  const proseHtml = prose.map(([label, value]) => `<section class="prose"><h2>${escapeHtml(label)}</h2><p>${escapeHtml(value)}</p></section>`).join('\n    ');
  const sourcesHtml = sources.map(({ publisher, title, url }) =>
    `<li><a href="${escapeHtml(url)}" rel="noopener noreferrer">${escapeHtml(publisher || title || url)}${publisher && title ? ` — ${escapeHtml(title)}` : ''}</a></li>`
  ).join('\n      ');

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="${robots}">
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Cannabis Strain Wisdom">
  <meta property="og:title" content="${escapeHtml(name)} | Cannabis Strain Wisdom">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:image:type" content="image/webp">
  <meta property="og:image:alt" content="${escapeHtml(visual.alt || name)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
  <meta name="twitter:image:alt" content="${escapeHtml(visual.alt || name)}">
  <title>${escapeHtml(name)} | Cannabis Strain Wisdom</title>
  <style>
    :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#06100c;color:#e7eee9;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.65}main{width:min(760px,calc(100% - 32px));margin:0 auto;padding:38px 0 54px}a{color:#e7cc78;overflow-wrap:anywhere}.kicker{color:#d8bd62;font-size:12px;font-weight:800;letter-spacing:.12em}h1{margin:.3rem 0 0;font-size:clamp(2rem,8vw,4rem);line-height:1.05}.jp{margin:.45rem 0 0;color:#91a198}.lead{margin:1.2rem 0 1.4rem;color:#becac2}.facts{display:grid;gap:10px;margin:22px 0}.facts div{padding:12px 14px;border:1px solid #24352c;border-radius:14px;background:#0a1711}.facts dt{color:#bba45e;font-size:11px;font-weight:800;letter-spacing:.1em}.facts dd{margin:4px 0 0}figure{margin:22px 0}img{display:block;width:100%;height:auto;border-radius:18px}.prose{margin:24px 0}.prose h2,.sources h2{font-size:1.2rem;color:#d8bd62}.sources{margin-top:34px}.sources li{margin:9px 0}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}.actions a{display:inline-flex;min-height:44px;align-items:center;padding:0 14px;border:1px solid #3b4b42;border-radius:999px;text-decoration:none}.muted{color:#7f9187}
  </style>
</head>
<body>
  <main>
    <div class="kicker">CULTIVAR</div>
    <h1>${escapeHtml(name)}</h1>
    ${jp ? `<p class="jp">${escapeHtml(jp)}</p>` : ''}
    <p class="lead">${escapeHtml(description)}</p>
    ${visualHtml}
    ${visual?.src && (cultivar.visuals || []).some(item => item.src === visual.src && item.aiGenerated) ? '<p class="muted">画像はAI生成による参考ビジュアルです。実物の写真や品種の同定資料ではありません。</p>' : ''}
    ${rowsHtml}
    ${proseHtml}
    <section class="sources"><h2>出典</h2><ol>${sourcesHtml}</ol></section>
    <nav class="actions" aria-label="関連リンク">
      <a href="${escapeHtml(interactive)}">図鑑の詳細表示で見る</a>
      <a href="../../cultivars/">品種一覧へ</a>
      <a href="../../">ホームへ</a>
    </nav>
  </main>
</body>
</html>
`;
}

const cultivars = catalog.cultivars
  .map(cultivar => ({ cultivar, id: cleanText(cultivar?.id), name: cleanText(cultivar?.name) }))
  .sort((a, b) => a.name.localeCompare(b.name, 'en'));

const seen = new Set();
for (const row of cultivars) {
  if (!/^[a-z0-9-]+$/.test(row.id)) throw new Error(`invalid cultivar id: ${row.id}`);
  if (seen.has(row.id)) throw new Error(`duplicate cultivar id: ${row.id}`);
  seen.add(row.id);
}

const cultivarRoot = path.join(outDir, 'cultivars');
fs.rmSync(cultivarRoot, { recursive: true, force: true });
fs.mkdirSync(cultivarRoot, { recursive: true });

for (const { cultivar, id } of cultivars) {
  const dir = path.join(cultivarRoot, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), pageFor(cultivar));
}

const indexRobots = indexing === 'open' ? 'index,follow' : 'noindex,nofollow,noarchive';
const listItems = cultivars.map(({ id, name }) =>
  `<li><a href="./${escapeHtml(id)}/">${escapeHtml(name)}</a></li>`
).join('\n      ');

// The home catalog also exposes ordinary HTML links for crawlers and readers without JS.
// Only the staged Pages artifact is changed; the interactive overlay remains untouched.
const homePath = path.join(outDir, 'index.html');
if (fs.existsSync(homePath)) {
  let home = fs.readFileSync(homePath, 'utf8');
  const anchor = '<section class="cultivar-grid" id="cultivar-grid" aria-live="polite"></section>';
  if (home.split(anchor).length !== 2) throw new Error('home catalog anchor missing or duplicated');
  const homeLinks = cultivars.map(({ id, name }) => `<li><a href="cultivars/${escapeHtml(id)}/">${escapeHtml(name)}</a></li>`).join('');
  home = home.replace(anchor, `${anchor}\n          <nav aria-label="品種ごとの静的ページ"><details><summary>品種ページ一覧</summary><ul>${homeLinks}</ul></details></nav>`);
  fs.writeFileSync(homePath, home);
}

fs.writeFileSync(path.join(cultivarRoot, 'index.html'), `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="${indexRobots}">
  <meta name="description" content="Cannabis Strain Wisdomで公開中の品種一覧。">
  <link rel="canonical" href="${siteRoot}cultivars/">
  <title>品種一覧 | Cannabis Strain Wisdom</title>
</head>
<body>
  <main>
    <h1>品種一覧</h1>
    <p>${cultivars.length} CULTIVARS</p>
    <ul>
      ${listItems}
    </ul>
    <p><a href="../">Cannabis Strain Wisdomへ戻る</a></p>
  </main>
</body>
</html>
`);

const sitemapUrls = [
  siteRoot,
  `${siteRoot}cultivars/`,
  ...cultivars.map(({ id }) => `${siteRoot}cultivars/${encodeURIComponent(id)}/`)
];
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map(url => `  <url><loc>${escapeHtml(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
fs.writeFileSync(path.join(outDir, 'sitemap.xml'), xml);

const robotsTxt = indexing === 'open'
  ? `User-agent: *\nAllow: /\nSitemap: ${siteRoot}sitemap.xml\n`
  : 'User-agent: *\nAllow: /\n';
fs.writeFileSync(path.join(outDir, 'robots.txt'), robotsTxt);

const manifest = {
  schemaVersion: 1,
  contract: 'PUBLIC_SEARCH_SURFACE_V1',
  generatedAt: cleanText(catalog.generatedAt) || null,
  indexing,
  siteRoot,
  cultivarCount: cultivars.length,
  sourceCatalog: path.basename(catalogPath),
  outputPaths: {
    cultivarIndex: 'cultivars/index.html',
    sitemap: 'sitemap.xml',
    robots: 'robots.txt'
  }
};
fs.writeFileSync(path.join(outDir, 'search-surface-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  contract: manifest.contract,
  indexing,
  cultivarCount: cultivars.length,
  outDir
}));
