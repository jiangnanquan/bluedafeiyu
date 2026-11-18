// Per-build localization inputs: immutable pre-indexed native data, tracked
// keyed reads and the digest record used to decide whether a localized page can
// be reused. Records only contain keys a render actually touched, and every
// recorded key is a short hash so long document text never enters build state.
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { guides, guidePath, characterSearchAliases } from '../src/lib/landing-copy.mjs';
import { aboutCopy, aboutQuestions } from '../src/lib/about-copy.mjs';
import { videoArchive } from '../src/lib/video-archive.mjs';
import { videoCopy } from '../src/lib/video-copy.mjs';
import { events, eventPageMetadata } from '../src/lib/events.mjs';
import { workCharacterIds } from '../../tools/work-characters.mjs';
import { isGifWork } from '../public/archive/work-format.js';

const sha256 = value => crypto.createHash('sha256').update(value).digest();
const shortHash = value => sha256(value).toString('base64url').slice(0, 22);
function stable(value) {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
}
// Keys and values are compared through short hashes. A missing value is the
// single-byte sentinel 0; present values carry a 22 character digest.
const keyHash = key => '#' + shortHash(String(key));
const valueDigest = value => value === undefined ? 0 : shortHash(stable(value));

const tableCache = new WeakMap();
function tableFor(snapshot) {
  let table = snapshot && typeof snapshot === 'object' ? tableCache.get(snapshot) : null;
  if (!table) {
    table = { snapshot, cache: new Map() };
    if (snapshot && typeof snapshot === 'object') tableCache.set(snapshot, table);
  }
  return table;
}
function cached(table, name, build) {
  if (!table.cache.has(name)) table.cache.set(name, build());
  return table.cache.get(name);
}
const works = table => table.snapshot.works || [];
const topics = table => table.snapshot.topics || [];
const characters = table => table.snapshot.characters || [];
const categories = table => table.snapshot.categories || [];

function indexFirst(list, keyOf) {
  const map = new Map();
  for (const item of list) {
    const key = keyOf(item);
    if (!map.has(key)) map.set(key, item);
  }
  return map;
}
function indexLast(list, keyOf) {
  const map = new Map();
  for (const item of list) map.set(keyOf(item), item);
  return map;
}
const bySlugFirst = table => cached(table, 'bySlugFirst', () => indexFirst(works(table), work => work.slug));
const bySlugLast = table => cached(table, 'bySlugLast', () => indexLast(works(table), work => work.slug));
const byWorkId = table => cached(table, 'byWorkId', () => indexFirst(works(table), work => work.id));
const byTopicId = table => cached(table, 'byTopicId', () => indexFirst(topics(table), topic => topic.id));
const byCharacterId = table => cached(table, 'byCharacterId', () => indexFirst(characters(table), character => character.id));
const byVideoId = table => cached(table, 'byVideoId', () => indexLast(videoArchive.videos, video => video.bvid));
const byCreatorUid = table => cached(table, 'byCreatorUid', () => indexFirst(videoArchive.creators, creator => creator.uid));
const byCreatorPath = table => cached(table, 'byCreatorPath', () => indexFirst(videoArchive.creators, creator => '/creators/bilibili-' + creator.uid + '.html'));
const creatorNames = table => cached(table, 'creatorNames', () => videoArchive.creators.map(creator => creator.name));
const creatorList = table => cached(table, 'creatorList', () => videoArchive.creators);
const gallery = table => cached(table, 'gallery', () => {
  const serialIds = new Set(topics(table).filter(topic => topic.reader).flatMap(topic => topic.workIds));
  return works(table).filter(work => !serialIds.has(work.id));
});
const publishedCount = table => cached(table, 'publishedCount', () => works(table).filter(work => work.status === 'published').length);
const textMap = (table, language) => cached(table, 'textMap:' + language, () => {
  const map = new Map();
  for (const work of works(table)) {
    const value = work.i18n?.[language];
    if (value) for (const field of ['name', 'description', 'commentary']) if (work[field] && !map.has(work[field])) map.set(work[field], value[field]);
  }
  for (const topic of topics(table)) {
    const value = topic.i18n?.[language];
    if (value) for (const field of ['name', 'summary']) if (topic[field] && value[field]) map.set(topic[field], value[field]);
  }
  return map;
});
const identities = table => cached(table, 'identities', () => new Set([
  '上善无形',
  ...videoArchive.creators.map(creator => creator.name),
  ...topics(table).map(topic => topic.author?.name),
  ...works(table).flatMap(work => [work.origin?.author, work.submitter?.name])
].filter(value => value && value.length > 1 && !['本人', '原作者未标注', '上游清单导入', '蓝色大肥鱼'].includes(value))));

const uidKey = uid => (uid === null ? 'null' : typeof uid) + ':' + String(uid);
function creatorCharacters(uid) {
  return videoArchive.videos.filter(video => video.uid === uid).flatMap(video => video.characterIds);
}

function gallerySelection(table, base, language) {
  const all = gallery(table);
  if (/^\/gifs(?:\/page\/\d+)?\.html$/.test(base)) return all.filter(isGifWork);
  const role = base.match(/^\/characters\/([^/]+)(?:\/(meme|illustration|setting|comic|standing|other))?(?:\/page\/\d+)?\.html$/);
  const category = base.match(/^\/categories\/([^/]+)(?:\/page\/\d+)?\.html$/);
  const character = role && byCharacterId(table).get(role[1]);
  const type = category?.[1] || (role?.[2] && role[2] !== 'page' ? role[2] : null);
  if (!character && !category) return null;
  return all.filter(work => (!character || workCharacterIds(work).includes(character.id)) && (!type || work.categoryIds?.includes(type)));
}
function selectedProjection(table, base, language) {
  const selected = gallerySelection(table, base, language);
  if (!selected) return null;
  return selected.map(work => ({ id: work.id, categoryIds: work.categoryIds, tags: work.tags, i18n: work.i18n?.[language] }));
}
function groupDigest(table, name) {
  if (name === 'works.publishedCount') return valueDigest(publishedCount(table));
  if (name === 'categories') return valueDigest(categories(table).map(category => category.id));
  if (name === 'video.creatorNames') return valueDigest(creatorNames(table));
  if (name === 'video.creatorList') return valueDigest(creatorList(table).map(creator => ({ uid: creator.uid, name: creator.name })));
  if (name === 'about.questions') return valueDigest(aboutQuestions);
  if (name.startsWith('works.gallery|')) {
    const [, language, base] = name.split('|');
    const selected = selectedProjection(table, base, language);
    return selected ? valueDigest(selected) : 0;
  }
  return 0;
}

function mapValueIndex(map, valueOf = item => item) {
  const out = new Map();
  for (const [key, item] of map) out.set(keyHash(key), valueDigest(valueOf(item)));
  return out;
}
function firstValueIndex(list, keyOf, valueOf = item => item) {
  const map = new Map();
  for (const item of list) {
    const key = keyHash(keyOf(item));
    if (!map.has(key)) map.set(key, valueDigest(valueOf(item)));
  }
  return map;
}
function ownValues(target) {
  const map = new Map();
  if (!target || typeof target !== 'object') return map;
  for (const key of Object.keys(target)) map.set(keyHash(key), valueDigest(target[key]));
  return map;
}
function presentKeys(target) {
  const map = new Map();
  if (!target) return map;
  for (const key of Object.keys(target)) map.set(keyHash(key), valueDigest(true));
  return map;
}

export function createDependencyChecker(translations, snapshot) {
  const table = tableFor(snapshot);
  const copy = translations?.ArchiveCopy;
  const labels = translations?.ArchiveLabels;
  const cache = new Map();
  const memo = (name, build) => {
    if (!cache.has(name)) cache.set(name, build());
    return cache.get(name);
  };

  const copyIndex = name => memo('copy:' + name, () => ownValues(copy?.[name]));
  const labelIndex = language => memo('labels:' + language, () => {
    const map = new Map();
    const row = labels?.[language];
    if (row && typeof row === 'object') for (const key of Object.keys(row)) map.set(keyHash(key), valueDigest({ own: true, value: row[key] }));
    return map;
  });
  const textIndex = language => memo('texts:' + language, () => {
    const map = new Map();
    for (const [key, value] of textMap(table, language)) map.set(keyHash(key), valueDigest(value));
    return map;
  });

  function keyDigest(section, key) {
    switch (section) {
      case 'copy.texts':
      case 'copy.tags':
      case 'copy.characters':
        return copyIndex(section.slice('copy.'.length)).get(key) ?? 0;
      case 'copy.section':
        return memo('copy:section', () => presentKeys(copy)).get(key) ?? 0;
      case 'labels.section':
        return memo('labels:section', () => presentKeys(labels)).get(key) ?? 0;
      case 'labels.en':
      case 'labels.ja':
        return labelIndex(section.slice('labels.'.length)).get(key) ?? 0;
      case 'works.slug.first':
        return memo('works:slug:first', () => mapValueIndex(bySlugFirst(table))).get(key) ?? 0;
      case 'works.slug.last':
        return memo('works:slug:last', () => mapValueIndex(bySlugLast(table))).get(key) ?? 0;
      case 'works.id':
        return memo('works:id', () => mapValueIndex(byWorkId(table))).get(key) ?? 0;
      case 'topics.id':
        return memo('topics:id', () => mapValueIndex(byTopicId(table))).get(key) ?? 0;
      case 'characters.id':
        return memo('characters:id', () => mapValueIndex(byCharacterId(table))).get(key) ?? 0;
      case 'videos.bvid':
        return memo('videos:bvid', () => mapValueIndex(byVideoId(table))).get(key) ?? 0;
      case 'creators.uid':
        return memo('creators:uid', () => mapValueIndex(byCreatorUid(table))).get(key) ?? 0;
      case 'creators.path':
        return memo('creators:path', () => firstValueIndex(videoArchive.creators, creator => '/creators/bilibili-' + creator.uid + '.html')).get(key) ?? 0;
      case 'video.creatorCharacters':
        return memo('video:creatorCharacters', () => {
          const map = new Map();
          for (const creator of videoArchive.creators) map.set(keyHash(uidKey(creator.uid)), valueDigest(creatorCharacters(creator.uid)));
          return map;
        }).get(key) ?? 0;
      case 'texts.en':
      case 'texts.ja':
        return textIndex(section.slice('texts.'.length)).get(key) ?? 0;
      case 'guide':
        return memo('guide', () => firstValueIndex(guides, guide => guidePath(guide))).get(key) ?? 0;
      case 'event':
        return memo('event', () => firstValueIndex(events, event => event.href)).get(key) ?? 0;
      case 'searchAlias':
        return memo('searchAlias', () => ownValues(characterSearchAliases)).get(key) ?? 0;
      case 'about.copy':
        return memo('about:copy', () => ownValues(aboutCopy)).get(key) ?? 0;
      case 'about.faq':
        return memo('about:faq', () => ownValues(aboutQuestions)).get(key) ?? 0;
      case 'videoCopy':
        return memo('videoCopy', () => ownValues(videoCopy)).get(key) ?? 0;
      default:
        return 0;
    }
  }

  function query(section, key) {
    if (section !== 'identity') return undefined;
    return memo('identity', () => {
      const set = new Set();
      for (const value of identities(table)) set.add(keyHash(value));
      return set;
    }).has(key);
  }

  return { group: name => memo('group:' + name, () => groupDigest(table, name)), key: keyDigest, query };
}

export function createNativeLookup(snapshot, trace = null) {
  const table = tableFor(snapshot);
  const group = name => { if (trace) trace.group(name); };
  const key = (section, value) => { if (trace) trace.key(section, value); };
  return {
    workBySlugFirst(slug) {
      if (slug === undefined) return undefined;
      key('works.slug.first', slug);
      return bySlugFirst(table).get(slug);
    },
    workBySlugLast(slug) {
      if (slug === undefined) return undefined;
      key('works.slug.last', slug);
      return bySlugLast(table).get(slug);
    },
    workById(id) {
      if (id === undefined) return undefined;
      key('works.id', id);
      return byWorkId(table).get(id);
    },
    topicById(id) {
      if (id === undefined) return undefined;
      key('topics.id', id);
      return byTopicId(table).get(id);
    },
    characterById(id) {
      if (id === undefined) return undefined;
      key('characters.id', id);
      return byCharacterId(table).get(id);
    },
    videoByBvid(bvid) {
      if (bvid === undefined) return undefined;
      key('videos.bvid', bvid);
      return byVideoId(table).get(bvid);
    },
    creatorByUid(uid) {
      if (uid === undefined) return undefined;
      key('creators.uid', uid);
      return byCreatorUid(table).get(uid);
    },
    creatorByPath(route) {
      key('creators.path', route);
      return byCreatorPath(table).get(route);
    },
    creatorCharacters(uid) {
      key('video.creatorCharacters', uidKey(uid));
      return creatorCharacters(uid);
    },
    creatorNames() {
      group('video.creatorNames');
      return creatorNames(table);
    },
    creatorList() {
      group('video.creatorList');
      return creatorList(table);
    },
    publishedCount() {
      group('works.publishedCount');
      return publishedCount(table);
    },
    categories() {
      group('categories');
      return categories(table);
    },
    galleryWorks(base, language) {
      group('works.gallery|' + language + '|' + base);
      return gallerySelection(table, base, language) || [];
    },
    localizedText(language, text) {
      key('texts.' + language, text);
      return textMap(table, language).get(text);
    },
    identity(text) {
      const present = identities(table).has(text);
      if (trace) trace.query('identity', text, present);
      return present;
    },
    guide(route) {
      key('guide', route);
      return guides.find(guide => guidePath(guide) === route);
    },
    eventMeta(route, language) {
      key('event', route);
      return eventPageMetadata(route, language);
    },
    searchAlias(id) {
      key('searchAlias', id);
      return characterSearchAliases[id];
    },
    aboutCopy(entry) {
      key('about.copy', entry);
      return aboutCopy[entry];
    },
    aboutQuestion(index) {
      key('about.faq', index);
      return aboutQuestions[index];
    },
    aboutQuestions() {
      group('about.questions');
      return aboutQuestions;
    },
    videoCopy(entry) {
      key('videoCopy', entry);
      return videoCopy[entry];
    },
    recordGroup(name) { group(name); }
  };
}

export function createTrace() {
  const trace = { groups: new Set(), keys: new Map(), queries: new Map() };
  trace.group = name => { if (name) trace.groups.add(name); };
  trace.key = (section, value) => {
    let set = trace.keys.get(section);
    if (!set) trace.keys.set(section, set = new Set());
    set.add(keyHash(value));
  };
  trace.query = (section, value, present) => {
    let map = trace.queries.get(section);
    if (!map) trace.queries.set(section, map = new Map());
    map.set(keyHash(value), present);
  };
  return trace;
}

export function finishRecord(trace, checker, base) {
  // Packed single string, line/tab separated: far lighter in V8 than nested
  // arrays when thousands of route records are kept for one build.
  const lines = ['r2', String(base), 'g'];
  for (const name of [...trace.groups].sort()) lines.push(name + '=' + checker.group(name));
  lines.push('k');
  for (const section of [...trace.keys.keys()].sort()) {
    const rows = [];
    for (const key of trace.keys.get(section)) {
      const digest = checker.key(section, key);
      rows.push(digest === 0 ? key : key + '=' + digest);
    }
    rows.sort();
    lines.push('s\t' + section + '\t' + rows.join('\t'));
  }
  lines.push('q');
  for (const section of [...trace.queries.keys()].sort()) {
    const rows = [];
    for (const [key, present] of trace.queries.get(section)) rows.push(present ? key + '=1' : key);
    rows.sort();
    lines.push('s\t' + section + '\t' + rows.join('\t'));
  }
  const packed = lines.join('\n');
  if (packed.length <= 2048) return packed;
  const compressed = zlib.deflateRawSync(Buffer.from(packed, 'utf8')).toString('base64url');
  return compressed.length + 3 < packed.length ? 'z2\n' + compressed : packed;
}

function matchesLegacyRecord(record, checker) {
  if (record.v !== 1) return false;
  for (const row of record.g || []) {
    if (!Array.isArray(row) || row.length !== 2 || checker.group(row[0]) !== row[1]) return false;
  }
  for (const pair of record.k || []) {
    if (!Array.isArray(pair) || pair.length !== 2 || !Array.isArray(pair[1])) return false;
    const section = pair[0];
    for (const row of pair[1]) {
      if (!Array.isArray(row) || row.length !== 2 || checker.key(section, row[0]) !== row[1]) return false;
    }
  }
  for (const pair of record.q || []) {
    if (!Array.isArray(pair) || pair.length !== 2 || !Array.isArray(pair[1])) return false;
    const section = pair[0];
    for (const row of pair[1]) {
      if (!Array.isArray(row) || row.length !== 2 || Number(Boolean(checker.query(section, row[0]))) !== row[1]) return false;
    }
  }
  return true;
}

export function matchesRecord(record, checker) {
  if (typeof record !== 'string') return Boolean(record) && matchesLegacyRecord(record, checker);
  try {
    if (record.startsWith('z2\n')) record = zlib.inflateRawSync(Buffer.from(record.slice(3), 'base64url')).toString('utf8');
  } catch { return false; }
  const lines = record.split('\n');
  if (lines[0] !== 'r2') return false;
  let mode = '';
  for (let index = 2; index < lines.length; index++) {
    const line = lines[index];
    if (line === 'g' || line === 'k' || line === 'q') { mode = line; continue; }
    if (line.startsWith('s\t')) {
      if (mode !== 'k' && mode !== 'q') return false;
      const columns = line.split('\t');
      const section = columns[1];
      for (let column = 2; column < columns.length; column++) {
        const token = columns[column];
        if (!token) continue;
        const equals = token.lastIndexOf('=');
        const key = equals < 0 ? token : token.slice(0, equals);
        if (mode === 'k') {
          if (checker.key(section, key) !== (equals < 0 ? 0 : token.slice(equals + 1))) return false;
        } else if (Number(Boolean(checker.query(section, key))) !== (equals < 0 ? 0 : Number(token.slice(equals + 1)))) return false;
      }
      continue;
    }
    if (mode !== 'g') return false;
    const equals = line.lastIndexOf('=');
    if (equals < 0 || checker.group(line.slice(0, equals)) !== line.slice(equals + 1)) return false;
  }
  return true;
}

// Only the tables lang.js actually indexes are wrapped; unrelated data stays a
// plain object. Both `get` and `getOwnPropertyDescriptor` are observed because
// lang.js checks hasOwnProperty for ArchiveLabels.
export function createTrackedTranslations(translations, trace) {
  const copyTarget = translations?.ArchiveCopy && typeof translations.ArchiveCopy === 'object' ? translations.ArchiveCopy : {};
  const labelsTarget = translations?.ArchiveLabels && typeof translations.ArchiveLabels === 'object' ? translations.ArchiveLabels : {};
  const sectionProxies = new Map();
  const labelProxies = new Map();

  const sectionProxy = (name, target) => {
    let proxy = sectionProxies.get(name);
    if (!proxy) {
      proxy = new Proxy(target, {
        get(section, property, receiver) {
          if (typeof property === 'symbol') return Reflect.get(section, property, receiver);
          trace.key('copy.' + name, property);
          return Reflect.get(section, property, receiver);
        },
        has(section, property) {
          if (typeof property !== 'symbol') trace.key('copy.' + name, property);
          return Reflect.has(section, property);
        },
        getOwnPropertyDescriptor(section, property) {
          if (typeof property !== 'symbol') trace.key('copy.' + name, property);
          return Reflect.getOwnPropertyDescriptor(section, property);
        }
      });
      sectionProxies.set(name, proxy);
    }
    return proxy;
  };

  const copyProxy = new Proxy(copyTarget, {
    get(target, property, receiver) {
      if (typeof property === 'symbol') return Reflect.get(target, property, receiver);
      if (property === 'texts' || property === 'tags' || property === 'characters') {
        trace.key('copy.section', property);
        const section = Reflect.get(target, property, receiver);
        return section && typeof section === 'object' ? sectionProxy(property, section) : section;
      }
      return Reflect.get(target, property, receiver);
    }
  });

  const labelProxy = (language, target) => {
    let proxy = labelProxies.get(language);
    if (!proxy) {
      proxy = new Proxy(target, {
        get(labels, property, receiver) {
          if (typeof property === 'symbol') return Reflect.get(labels, property, receiver);
          trace.key('labels.' + language, property);
          return Reflect.get(labels, property, receiver);
        },
        has(labels, property) {
          if (typeof property !== 'symbol') trace.key('labels.' + language, property);
          return Reflect.has(labels, property);
        },
        getOwnPropertyDescriptor(labels, property) {
          if (typeof property !== 'symbol') trace.key('labels.' + language, property);
          return Reflect.getOwnPropertyDescriptor(labels, property);
        }
      });
      labelProxies.set(language, proxy);
    }
    return proxy;
  };

  const labelsProxy = new Proxy(labelsTarget, {
    get(target, property, receiver) {
      if (typeof property === 'symbol') return Reflect.get(target, property, receiver);
      trace.key('labels.section', property);
      const value = Reflect.get(target, property, receiver);
      return value && typeof value === 'object' ? labelProxy(property, value) : value;
    }
  });

  return { ...translations, ArchiveCopy: copyProxy, ArchiveLabels: labelsProxy };
}
