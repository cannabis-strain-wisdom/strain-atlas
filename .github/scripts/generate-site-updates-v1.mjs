import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ALLOWED = new Set(['SITE', 'EVIDENCE', 'DATA', 'CULTIVAR']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(message) {
  throw new Error(`CSW_SITE_UPDATES_V1: ${message}`);
}

function argsFrom(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith('--') || value == null) fail('invalid arguments');
    out[key.slice(2)] = value;
  }
  for (const key of ['baseline', 'catalog', 'publication', 'output']) {
    if (!out[key]) fail(`missing --${key}`);
  }
  const maxCommits = Number(out['max-commits'] || 120);
  if (!Number.isInteger(maxCommits) || maxCommits < 1 || maxCommits > 500) {
    fail('max-commits must be between 1 and 500');
  }
  out.maxCommits = maxCommits;
  return out;
}

function git(argv, optional = false) {
  try {
    return execFileSync('git', argv, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', optional ? 'ignore' : 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    if (optional) return null;
    throw error;
  }
}

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalize(entry, time, rank = 0) {
  const date = clean(entry?.date);
  const category = clean(entry?.category).toUpperCase();
  const title = clean(entry?.title);
  const summary = clean(entry?.summary);
  if (!DATE_RE.test(date) || !ALLOWED.has(category) || !title || !summary) return null;
  if (title.length > 120 || summary.length > 360) return null;
  return { date, category, title, summary, _time: time || Date.parse(`${date}T00:00:00Z`), _rank: rank };
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function readJsonAt(ref, filename) {
  const raw = git(['show', `${ref}:${filename}`], true);
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function parseRecords(raw) {
  return raw.split('\x1e').map(v => v.trim()).filter(Boolean).map(record => {
    const parts = record.split('\x1f');
    return { sha: parts[0] || '', iso: parts[1] || '', body: parts.slice(2).join('\x1f') };
  }).filter(v => /^[0-9a-f]{40}$/i.test(v.sha));
}

function trailerEntry(commit) {
  const values = new Map();
  for (const line of commit.body.split(/\r?\n/)) {
    const m = line.match(/^PUBLIC-UPDATE-(CATEGORY|TITLE|SUMMARY|DATE):\s*(.+)$/i);
    if (m) values.set(m[1].toUpperCase(), m[2].trim());
  }
  if (![...['CATEGORY','TITLE','SUMMARY']].every(k => values.has(k))) return null;
  return normalize({
    date: values.get('DATE') || commit.iso.slice(0,10),
    category: values.get('CATEGORY'),
    title: values.get('TITLE'),
    summary: values.get('SUMMARY'),
  }, Date.parse(commit.iso), 30);
}

function published(registry) {
  return new Set((registry?.entries || [])
    .filter(e => e?.state === 'published' && typeof e?.strainId === 'string' && e.strainId)
    .map(e => e.strainId));
}

function nameMap(catalog) {
  const map = new Map();
  for (const item of catalog?.cultivars || []) {
    if (typeof item?.id === 'string' && typeof item?.name === 'string' && item.name.trim()) {
      map.set(item.id, item.name.trim());
    }
  }
  return map;
}

function cultivarEntry(commit, currentCatalog) {
  const parent = git(['rev-parse', `${commit.sha}^`], true)?.trim();
  if (!parent) return null;
  const before = readJsonAt(parent, 'production/publication.json');
  const after = readJsonAt(commit.sha, 'production/publication.json');
  if (!after) return null;

  const beforeSet = published(before);
  const afterSet = published(after);
  const added = [...afterSet].filter(id => !beforeSet.has(id));
  if (!added.length) return null;

  const atCommit = nameMap(readJsonAt(commit.sha, 'runtime/catalog.json'));
  const now = nameMap(currentCatalog);
  const names = added.map(id => atCommit.get(id) || now.get(id) || '').filter(Boolean);
  if (!names.length) return null;

  const visible = names.slice(0,5);
  const extra = Math.max(0, names.length - visible.length);
  const title = names.length === 1
    ? `${names[0]}を新しく追加しました`
    : `${names[0]}ほか${names.length - 1}品種を新しく追加しました`;
  const list = visible.join('、') + (extra ? `、ほか${extra}品種` : '');

  return normalize({
    date: commit.iso.slice(0,10),
    category: 'CULTIVAR',
    title,
    summary: `新しく公開した品種: ${list}。確認できた出典と現在のCSW基準に沿って公開しました。`,
  }, Date.parse(commit.iso), 20);
}

const args = argsFrom(process.argv.slice(2));
if (path.resolve(args.baseline) === path.resolve(args.output)) {
  fail('output must not overwrite repository baseline');
}

const baseline = readJson(args.baseline);
const currentCatalog = readJson(args.catalog);
const currentPublication = readJson(args.publication);
if (!Array.isArray(baseline?.entries)) fail('baseline entries missing');
if (!Array.isArray(currentCatalog?.cultivars)) fail('catalog cultivars missing');
if (!Array.isArray(currentPublication?.entries)) fail('publication entries missing');

const baselineEntries = baseline.entries
  .map((entry, index) => normalize(entry, undefined, 10 - index / 1000))
  .filter(Boolean);

const commits = parseRecords(git(['log', `-${args.maxCommits}`, '--format=%H%x1f%cI%x1f%B%x1e']));
const trailerEntries = commits.map(trailerEntry).filter(Boolean);

const publicationCommits = parseRecords(git([
  'log',
  `-${args.maxCommits}`,
  '--format=%H%x1f%cI%x1f%x1e',
  '--',
  'production/publication.json',
]));
const cultivarEntries = publicationCommits.map(c => cultivarEntry(c, currentCatalog)).filter(Boolean);

const all = [...trailerEntries, ...cultivarEntries, ...baselineEntries];
const seen = new Set();
const entries = all
  .sort((a,b) => b._time - a._time || b._rank - a._rank || a.title.localeCompare(b.title, 'ja'))
  .filter(entry => {
    const key = [entry.date, entry.category, entry.title, entry.summary].join('\u0000');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })
  .slice(0,60)
  .map(({date,category,title,summary}) => ({date,category,title,summary}));

const head = git(['rev-parse','HEAD']).trim();
const generatedAt = git(['show','-s','--format=%cI','HEAD']).trim();
const output = {
  schemaVersion: 'CSW_SITE_UPDATES_V1',
  generatedFromCommit: head,
  generatedAt,
  entries,
};

fs.mkdirSync(path.dirname(path.resolve(args.output)), { recursive: true });
fs.writeFileSync(args.output, JSON.stringify(output, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  status: 'PASS',
  contract: 'CSW_SITE_UPDATES_V1',
  generatedFromCommit: head,
  entries: entries.length,
  trailerEntries: trailerEntries.length,
  cultivarEntries: cultivarEntries.length,
  baselineEntries: baselineEntries.length,
}, null, 2));
