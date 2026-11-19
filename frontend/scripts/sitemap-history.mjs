import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DOMParser, parseHTML } from 'linkedom';
import {ORIGIN, LOCALES, localizedPath} from './site-locales.mjs';

const escape = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[char]));

// sitemap image: absolute URL through the punycode origin, or the remote URL
// unchanged. The shared placeholder is never advertised as a work image.
export function sitemapImageURL(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  let url;
  try { url = new URL(value.trim(), ORIGIN + '/'); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.pathname.split('/').pop() === 'image-placeholder.svg') return null;
  return url.href;
}

// Display image first; when it is missing or a placeholder, reuse the real
// thumbnail of the same work (and never mix in another work's image).
export function sitemapWorkImage(work) {
  return sitemapImageURL(work?.displayUrl) || sitemapImageURL(work?.thumbUrl);
}

export function languageSitemap(paths, lastmods = new Map(), images = new Map()) {
  const rows = paths.flatMap(base => LOCALES.map(locale => {
    const alternatives = LOCALES.concat([{ prefix: '', hreflang: 'x-default' }]).map(other => '<xhtml:link rel="alternate" hreflang="' + other.hreflang + '" href="' + escape(ORIGIN + localizedPath(base, other)) + '"/>').join('');
    const lastmod = lastmods.get(localizedPath(base, locale));
    // Work pages advertise their own image so image search indexes the real file.
    const image = sitemapImageURL(images.get(base));
    const imageTag = image ? '<image:image><image:loc>' + escape(image) + '</image:loc></image:image>' : '';
    return '  <url><loc>' + escape(ORIGIN + localizedPath(base, locale)) + '</loc>' + (lastmod ? '<lastmod>' + escape(lastmod) + '</lastmod>' : '') + imageTag + alternatives + '</url>';
  }));
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' + rows.join('\n') + '\n</urlset>\n';
}

const text = value => String(value || '').replace(/\s+/gu, ' ').trim();
const attributes = ['href', 'src', 'srcset', 'alt', 'title', 'datetime', 'width', 'height', 'type'];
const ignored = 'script,style,[data-work-stats],[data-stats-note],[data-work-download-count],[data-work-views],.comments-section';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().filter(key => !['dateModified', 'interactionStatistic'].includes(key)).map(key => [key, stable(value[key])]));
}

// Compare content that a crawler reads, excluding live counters and presentation-only attributes.
export function pageFingerprint(html) {
  const document = parseHTML(html).document;
  const main = document.querySelector('main');
  if (!main) throw new Error('Indexable page has no main content');
  for (const node of main.querySelectorAll(ignored)) node.remove();
  const visit = node => {
    if (node.nodeType === 3) return text(node.textContent);
    if (node.nodeType !== 1) return null;
    return [node.localName, attributes.filter(a => node.hasAttribute(a)).map(a => [a, node.getAttribute(a)]), [...node.childNodes].map(visit).filter(v => v !== null && v !== '')];
  };
  const metadata = [...document.querySelectorAll('meta[name="description"],meta[property^="og:"],meta[name^="twitter:"],link[rel="canonical"],link[hreflang]')].map(node => [node.getAttribute('name') || node.getAttribute('property') || node.getAttribute('hreflang') || node.getAttribute('rel'), node.getAttribute('content') || node.getAttribute('href')]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map(node => stable(JSON.parse(node.textContent)));
  return crypto.createHash('sha256').update(JSON.stringify([text(document.title), metadata, schemas, visit(main)])).digest('hex');
}

function pageFile(directory, pathname) {
  if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0')) throw new Error('Invalid sitemap page path');
  const file = path.resolve(directory, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
  const relative = path.relative(path.resolve(directory), file);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !file.endsWith('.html')) throw new Error('Sitemap page outside release directory');
  return file;
}

function timestamp(value, now) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed > now.getTime()) throw new Error('Invalid or future sitemap lastmod: ' + value);
  return new Date(parsed).toISOString();
}

// The previous published sitemap and HTML are the history; no separate mutable database is needed.
export function readSitemapHistory(directory, { origin, now = new Date(), known = new Map() }) {
  const records = new Map();
  let seeded = 0;
  const sitemap = path.join(directory, 'sitemap.xml');
  if (!fs.existsSync(sitemap)) return { records, seeded };
  directory = fs.realpathSync(directory);
  const xml = fs.readFileSync(sitemap, 'utf8');
  const parser = new DOMParser();
  let found = false;
  // Visit one URL record at a time so old alternate links do not fill the heap.
  for (const [row] of xml.matchAll(/<url(?:\s[^>]*)?>[\s\S]*?<\/url\s*>/g)) {
    found = true;
    const entry = parser.parseFromString(row, 'text/xml');
    const url = new URL(entry.querySelector('loc')?.textContent || '');
    if (url.origin !== origin) continue;
    const file = pageFile(directory, url.pathname);
    if (!fs.existsSync(file)) throw new Error('Previous sitemap page missing: ' + url.pathname);
    const prior = entry.querySelector('lastmod')?.textContent;
    // First rollout has no historical lastmod. Preserve the current release's real file time as a baseline.
    const lastmod = timestamp(prior || fs.statSync(file).mtime.toISOString(), now);
    if (!prior) seeded++;
    records.set(url.pathname, { fingerprint: known.get(url.pathname)?.fingerprint || pageFingerprint(fs.readFileSync(file, 'utf8')), lastmod });
  }
  if (!found) throw new Error('Previous sitemap has no URL records');
  return { records, seeded };
}

export function updateSitemapHistory(paths, directory, previous, { now = new Date(), unchangedPaths = new Set() } = {}) {
  const lastmods = new Map();
  const records = new Map();
  let changed = 0, unchanged = 0, added = 0, fingerprinted = 0;
  for (const pathname of paths) {
    const prior = previous.records.get(pathname);
    const reuse = unchangedPaths.has(pathname) && prior;
    const fingerprint = reuse ? prior.fingerprint : pageFingerprint(fs.readFileSync(pageFile(directory, pathname), 'utf8'));
    if (!reuse) fingerprinted++;
    if (prior?.fingerprint === fingerprint) {
      lastmods.set(pathname, timestamp(prior.lastmod, now));
      unchanged++;
    } else {
      lastmods.set(pathname, now.toISOString());
      if (prior) changed++; else added++;
    }
    records.set(pathname,{fingerprint,lastmod:lastmods.get(pathname)});
  }
  return { lastmods, records, changed, unchanged, added, fingerprinted, seeded: previous.seeded };
}
