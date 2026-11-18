import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseHTML} from '../../frontend/node_modules/linkedom/esm/index.js';
import {videoArchive} from '../../frontend/src/lib/video-archive.mjs';

// Bump when the traversal/checking logic changes; pattern and selector changes
// are folded into AUDIT_RULES automatically.
const CACHE_VERSION = 2;
const LANGS = ['en', 'ja'];
const PATTERNS = {
  en: /[\u3400-\u9fff]|Whale[ -]?Chan|DeepSeek Chan\.com|Blue Fish|Fat Fish/u,
  ja: /蓝|鲸|这|们|说|图|语|DeepSeek Chan\.com/u
};
const BRAND_EXEMPTIONS = ['蓝色大肥鱼', '藍色大肥魚'];
const BRAND_EXEMPT_KINDS = new Set(['title', 'metadata', 'schema']);
const SKIP_SELECTOR = 'script,style,code,pre,textarea,noscript,.lang-menu';
const ATTRIBUTES = ['alt', 'title', 'aria-label', 'placeholder'];
const METADATA_SELECTOR = 'meta[name="description"],meta[property="og:title"],meta[property="og:description"],meta[property="og:image:alt"]';
const SCHEMA_SKIP_KEYS = new Set(['author', 'creator', 'copyrightHolder']);
const SCHEMA_TEXT_KEYS = new Set(['name', 'description', 'text', 'headline', 'keywords', 'caption']);

const digest = value => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const invokedAsScript = (() => {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
const AUDIT_RULES = digest({
  version: CACHE_VERSION,
  patterns: Object.fromEntries(LANGS.map(lang => [lang, {source: PATTERNS[lang].source, flags: PATTERNS[lang].flags}])),
  brand: BRAND_EXEMPTIONS,
  brandKinds: [...BRAND_EXEMPT_KINDS],
  skip: SKIP_SELECTOR,
  attributes: ATTRIBUTES,
  metadata: METADATA_SELECTOR,
  schemaSkip: [...SCHEMA_SKIP_KEYS],
  schemaText: [...SCHEMA_TEXT_KEYS],
  strip: '投稿'
});

// Author/submitter names are allowed verbatim in both locales. Longest first
// keeps overlapping full credits intact; equal-length names keep snapshot order
// because replacement order can matter when one removal joins the next match.
function allowanceIdentities(snapshot) {
  const names = [
    '上善无形',
    ...videoArchive.creators.map(creator => creator.name),
    ...(snapshot.topics || []).map(topic => topic.author?.name),
    ...(snapshot.works || []).flatMap(work => [work?.origin?.author, work?.submitter?.name])
  ];
  return [...new Set(names)]
    .filter(value => typeof value === 'string' && value.length > 1)
    .sort((a, b) => b.length - a.length);
}

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Matches the old snapshot.works.find(...) first-hit behavior without scanning
// the whole catalog for every page.
function workIndex(snapshot) {
  const works = new Map();
  for (const work of snapshot.works || []) {
    const slug = work?.slug;
    if (typeof slug === 'string' && slug && !works.has(slug)) works.set(slug, work);
  }
  return works;
}

function htmlFiles(dir, base = dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === '.rsync-tmp') continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...htmlFiles(file, base));
    } else if (entry.name.endsWith('.html')) {
      files.push(path.relative(base, file).split(path.sep).join('/'));
    }
  }
  return files.sort();
}

function writeReport(file, report) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
}

const compact = value => String(value || '').replace(/[\r\n\t]+/g, ' ').slice(0, 160);

// Same shape summarizeAuditFailure parses, plus a ready-to-throw diagnostic.
function auditFailure(report) {
  const examples = report.problems.slice(0, 3).map(item => `${compact(item.file)} [${compact(item.kind || 'content')}] ${compact(item.text || item.problem)}`);
  const error = new Error(`英日页面审计失败（${report.problems.length} 处）：${examples.join('；')}`);
  error.code = 'AUDIT_FAILED';
  error.report = report;
  return error;
}

function cachedEntryMatches(entry, {hash, lang, works}) {
  if (!entry || typeof entry !== 'object' || entry.hash !== hash) return false;
  if (entry.details !== 0 && entry.details !== 1) return false;
  if (entry.slug !== null && typeof entry.slug !== 'string') return false;
  if (entry.name !== null && typeof entry.name !== 'string') return false;
  if (!entry.slug) return entry.details === 0 && entry.name === null;
  const work = works.get(entry.slug);
  if (!work) return entry.details === 0 && entry.name === null;
  const native = work.i18n?.[lang];
  if (!native || typeof native.name !== 'string') return false;
  return entry.details === 1 && entry.name === native.name;
}

function auditPage(html, {lang, file, root, works, identities, identityProbe}) {
  const {document} = parseHTML(html);
  const pattern = PATTERNS[lang];
  const basename = path.basename(file);
  const problemFile = path.relative(root, file);
  const problems = [];
  const seen = new Set();
  const slug = document.body?.getAttribute('data-work-slug') || null;
  const work = slug ? works.get(slug) : undefined;
  const native = work?.i18n?.[lang];
  const details = work ? 1 : 0;
  if (work && (!native || document.querySelector('main h1')?.textContent !== native.name || !document.querySelector('[data-work-faq]'))) {
    problems.push({file: problemFile, problem: 'Missing native work title/FAQ'});
  }

  const remaining = text => {
    let result = String(text || '');
    for (const name of identities) result = result.replaceAll(name, '');
    return result.replaceAll('投稿', '');
  };
  function check(text, kind) {
    const value = String(text || '').trim();
    if (!value || seen.has(value)) return;
    // Removing an allowance token can join ASCII pieces into a banned phrase,
    // so text containing any token still needs the original replacement pass.
    // When none is present the pass is a no-op and the value is exact.
    let checked = identityProbe.test(value) ? remaining(value) : value;
    // The homepage SEO intentionally includes the exact Chinese brand.
    if (BRAND_EXEMPT_KINDS.has(kind) && basename === 'index.html') {
      for (const brand of BRAND_EXEMPTIONS) checked = checked.replaceAll(brand, '');
    }
    if (pattern.test(checked)) {
      seen.add(value);
      problems.push({file: problemFile, kind, text: value});
    }
  }

  // Walk direct children so skipped containers are pruned without closest()
  // lookups or materializing the whole body selector list.
  const walk = element => {
    for (const child of element.children) {
      if (child.matches(SKIP_SELECTOR)) continue;
      for (const node of child.childNodes) if (node.nodeType === 3) check(node.textContent, 'body');
      for (const attribute of ATTRIBUTES) if (child.hasAttribute(attribute)) check(child.getAttribute(attribute), attribute);
      walk(child);
    }
  };
  if (document.body) walk(document.body);

  check(document.title, 'title');
  for (const meta of document.querySelectorAll(METADATA_SELECTOR)) check(meta.getAttribute('content'), 'metadata');
  function schema(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (SCHEMA_SKIP_KEYS.has(key)) continue;
      if (typeof item === 'string' && SCHEMA_TEXT_KEYS.has(key)) check(item, 'schema');
      else if (typeof item === 'object') schema(item);
    }
  }
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) schema(JSON.parse(script.textContent));

  return {
    problems,
    details,
    slug: slug || null,
    name: details && typeof native?.name === 'string' ? native.name : null
  };
}

/**
 * Audit every current EN/JA page and return the per-page cache record stored as
 * state.audit.
 *
 * @param {string} out Release/stage directory.
 * @param {object} [options]
 * @param {object} [options.snapshot] Site snapshot; read from site-data.json when omitted.
 * @param {object} [options.previous] state.audit from the validated previous release.
 * @param {Set<string>|Iterable<string>} [options.reusable] Base HTML files (no
 *   leading slash) whose locale outputs were copied byte-for-byte from `previous`.
 * @param {string} [options.reportFile] Report path; defaults to
 *   <out>/native-localization-audit.json like the CLI.
 * @param {Map<string,string>|Record<string,string>} [options.digests] SHA-256 of
 *   each locale-relative HTML file (for example en/index.html), so cache hits do
 *   not reread the file.
 * @returns {{version:number,rules:string,identities:string,pages:Record<string,{hash:string,details:0|1,slug:string|null,name:string|null}>}}
 * @throws {Error & {code:'AUDIT_FAILED',report:{pages:number,details:number,problems:object[]}}}
 *   after writing the same report file the CLI uses.
 */
export function auditLanguagePages(out, {snapshot, previous, reusable, reportFile, digests} = {}) {
  const root = path.resolve(out);
  const data = snapshot || JSON.parse(fs.readFileSync(path.join(root, 'site-data.json'), 'utf8'));
  const identities = allowanceIdentities(data);
  // The ordered list is scope: replacement order can change the audit outcome.
  const identityDigest = digest(identities);
  const identityProbe = new RegExp([...identities, '投稿'].map(escapeRegExp).join('|'));
  const works = workIndex(data);
  const reuseBase = new Set();
  for (const value of reusable || []) if (typeof value === 'string' && value) reuseBase.add(value.replace(/^\/+/, ''));
  const cached = previous && previous.version === CACHE_VERSION && previous.rules === AUDIT_RULES && previous.identities === identityDigest && previous.pages && typeof previous.pages === 'object' && !Array.isArray(previous.pages) ? previous.pages : null;
  // Integrations already hash every localized artifact they copy or write.
  // Reuse those digests so a cache hit never rereads the locale HTML.
  const knownDigest = key => digests instanceof Map ? digests.get(key) : digests && typeof digests === 'object' ? digests[key] : undefined;
  const suppliedDigest = key => {
    const value = knownDigest(key);
    return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
  };

  const pages = {};
  const problems = [];
  let pageCount = 0;
  let detailCount = 0;
  let reusedCount = 0;
  for (const lang of LANGS) {
    for (const relative of htmlFiles(path.join(root, lang))) {
      const key = lang + '/' + relative;
      const file = path.join(root, lang, relative);
      const suppliedHash = suppliedDigest(key);
      pageCount += 1;
      const prior = cached && reuseBase.has(relative) && Object.hasOwn(cached, key) ? cached[key] : null;
      if (suppliedHash && prior && cachedEntryMatches(prior, {hash: suppliedHash, lang, works})) {
        pages[key] = {hash: suppliedHash, details: prior.details, slug: prior.slug, name: prior.name};
        detailCount += prior.details;
        reusedCount += 1;
        continue;
      }
      const bytes = fs.readFileSync(file);
      const currentHash = digest(bytes);
      if (prior && cachedEntryMatches(prior, {hash: currentHash, lang, works})) {
        pages[key] = {hash: currentHash, details: prior.details, slug: prior.slug, name: prior.name};
        detailCount += prior.details;
        reusedCount += 1;
        continue;
      }
      const result = auditPage(bytes.toString('utf8'), {lang, file, root, works, identities, identityProbe});
      detailCount += result.details;
      if (result.problems.length) problems.push(...result.problems);
      else pages[key] = {hash: currentHash, details: result.details, slug: result.slug, name: result.name};
    }
  }

  const report = {pages: pageCount, details: detailCount, problems};
  writeReport(reportFile ? path.resolve(reportFile) : path.join(root, 'native-localization-audit.json'), report);
  // Keep the standalone CLI's JSON stdout unchanged; builds get progress counts.
  if (!invokedAsScript) process.stdout.write(`[audit] ${pageCount} pages, ${reusedCount} reused, ${pageCount - reusedCount} scanned, ${problems.length} problems\n`);
  if (problems.length) throw auditFailure(report);
  return {version: CACHE_VERSION, rules: AUDIT_RULES, identities: identityDigest, pages};
}

function cli() {
  const out = path.resolve(process.argv[2] || '.build/native-localization');
  const reportFile = process.argv[3] ? path.resolve(process.argv[3]) : undefined;
  let record;
  try {
    record = auditLanguagePages(out, {reportFile});
  } catch (error) {
    if (error?.code !== 'AUDIT_FAILED') throw error;
    const {report} = error;
    console.log(JSON.stringify({pages: report.pages, details: report.details, problems: report.problems.length, samples: report.problems.slice(0, 25)}, null, 2));
    process.exitCode = 1;
    return;
  }
  const entries = Object.values(record.pages);
  const details = entries.reduce((sum, entry) => sum + entry.details, 0);
  console.log(JSON.stringify({pages: entries.length, details, problems: 0, samples: []}, null, 2));
}

if (invokedAsScript) cli();
