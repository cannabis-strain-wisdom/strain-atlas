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
const indexing = readArg('indexing') || 'closed';
const siteRoot = (readArg('site-root') || 'https://cannabis-strain-wisdom.github.io/strain-atlas/').replace(/\/+$/, '/');

if (!['closed', 'open'].includes(indexing)) throw new Error(`unsupported indexing mode: ${indexing}`);

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
if (!Array.isArray(catalog?.cultivars)) throw new Error('catalog cultivars missing');
const ids = catalog.cultivars.map(item => String(item?.id || '').trim()).sort();
if (!ids.length) throw new Error('catalog has zero cultivars');
if (new Set(ids).size !== ids.length) throw new Error('duplicate cultivar ids in catalog');

const problems = [];
const forbidden = [
  'authorityRole',
  'claimOrigin',
  'rawAnalyteName',
  'rawValue',
  'transcriptionMethod',
  'transcriptionStatus',
  'qualitativeAssertions',
  'observations'
];

const manifestPath = path.join(outDir, 'search-surface-manifest.json');
if (!fs.existsSync(manifestPath)) problems.push('MANIFEST_MISSING');
else {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.contract !== 'PUBLIC_SEARCH_SURFACE_V1') problems.push('MANIFEST_CONTRACT_INVALID');
  if (manifest.indexing !== indexing) problems.push(`MANIFEST_INDEXING_MISMATCH:${manifest.indexing}`);
  if (manifest.cultivarCount !== ids.length) problems.push(`MANIFEST_COUNT_MISMATCH:${manifest.cultivarCount}->${ids.length}`);
}

const cultivarIndexPath = path.join(outDir, 'cultivars', 'index.html');
if (!fs.existsSync(cultivarIndexPath)) problems.push('CULTIVAR_INDEX_MISSING');
const cultivarIndex = fs.existsSync(cultivarIndexPath) ? fs.readFileSync(cultivarIndexPath, 'utf8') : '';

const expectedRobotsMeta = indexing === 'open'
  ? '<meta name="robots" content="index,follow,max-image-preview:large">'
  : '<meta name="robots" content="noindex,nofollow,noarchive">';

const expectedDirs = new Set(ids);
const cultivarRoot = path.join(outDir, 'cultivars');
const actualDirs = fs.existsSync(cultivarRoot)
  ? fs.readdirSync(cultivarRoot, { withFileTypes: true }).filter(row => row.isDirectory()).map(row => row.name).sort()
  : [];

for (const id of actualDirs) if (!expectedDirs.has(id)) problems.push(`ORPHAN_CULTIVAR_PAGE:${id}`);
for (const id of ids) {
  const pagePath = path.join(cultivarRoot, id, 'index.html');
  if (!fs.existsSync(pagePath)) {
    problems.push(`CULTIVAR_PAGE_MISSING:${id}`);
    continue;
  }
  const html = fs.readFileSync(pagePath, 'utf8');
  const cultivar = catalog.cultivars.find(item => item.id === id);
  const name = String(cultivar?.name || '').trim();
  const canonical = `${siteRoot}cultivars/${id}/`;

  if (!html.includes(expectedRobotsMeta)) problems.push(`ROBOTS_META_MISMATCH:${id}`);
  if (!html.includes(`<link rel="canonical" href="${canonical}">`)) problems.push(`CANONICAL_MISMATCH:${id}`);
  if (!html.includes(`<title>${name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')} | Cannabis Strain Wisdom</title>`)) problems.push(`TITLE_MISMATCH:${id}`);
  if (!/<h1>[^<]+<\/h1>/.test(html)) problems.push(`H1_MISSING:${id}`);
  if (!html.includes(`?strain=${id}`)) problems.push(`INTERACTIVE_LINK_MISSING:${id}`);
  if (!cultivarIndex.includes(`href="./${id}/"`)) problems.push(`INDEX_LINK_MISSING:${id}`);
  for (const key of forbidden) if (html.includes(key)) problems.push(`PRIVATE_FIELD_LEAK:${id}:${key}`);
}

const sitemapPath = path.join(outDir, 'sitemap.xml');
if (!fs.existsSync(sitemapPath)) problems.push('SITEMAP_MISSING');
else {
  const sitemap = fs.readFileSync(sitemapPath, 'utf8');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  const expected = new Set([siteRoot, `${siteRoot}cultivars/`, ...ids.map(id => `${siteRoot}cultivars/${id}/`)]);
  if (locs.length !== expected.size) problems.push(`SITEMAP_COUNT_MISMATCH:${locs.length}->${expected.size}`);
  for (const url of expected) if (!locs.includes(url)) problems.push(`SITEMAP_URL_MISSING:${url}`);
}

const robotsPath = path.join(outDir, 'robots.txt');
if (!fs.existsSync(robotsPath)) problems.push('ROBOTS_TXT_MISSING');
else {
  const robots = fs.readFileSync(robotsPath, 'utf8');
  if (indexing === 'closed') {
    if (!/^User-agent: \*\nAllow: \/\n$/.test(robots)) problems.push('ROBOTS_CLOSED_CONTRACT_MISMATCH');
    if (/Sitemap:/i.test(robots)) problems.push('ROBOTS_CLOSED_MUST_NOT_ADVERTISE_SITEMAP');
  } else {
    if (!robots.includes('Allow: /')) problems.push('ROBOTS_OPEN_ALLOW_MISSING');
    if (!robots.includes(`Sitemap: ${siteRoot}sitemap.xml`)) problems.push('ROBOTS_OPEN_SITEMAP_MISSING');
  }
}

if (actualDirs.length !== ids.length) problems.push(`CULTIVAR_DIRECTORY_COUNT_MISMATCH:${actualDirs.length}->${ids.length}`);

if (problems.length) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'PASS',
  contract: 'PUBLIC_SEARCH_SURFACE_V1',
  indexing,
  cultivarCount: ids.length,
  sitemapUrlCount: ids.length + 2,
  privateFieldLeakCount: 0
}));
