/* 蓝色大肥鱼 · 站点多语言层（zh 默认 / zh-Hant / en / ja）
   --------------------------------------------------------------------------
   约定（与各页手写脚本和 tools/generate_work_pages.mjs 的模板共同成立）：
     · 中文（zh）不进词典：zh 就是各页 HTML 的原文与各处 JS 的兜底串，运行时
       首次应用时把原文缓存起来，切回 zh 直接还原，词典与页面永不漂移；
     · 静态文案：元素挂 data-i18n="key"（替换 textContent）；含行内子元素
       （<strong> / <a> / <span class="marker-highlight">）的段落，把每段纯文本
       用 <span data-i18n=...> 包住再翻，保证翻译只动文本、不动结构；
     · 带变量的文案：data-i18n-tpl="key" + data-i18n-vars='{"name":"…"}'（JSON），
       词典值里写 {name} 占位；{kindId} 是特殊变量，运行时按 kind.<id> 取品类词；
     · 属性文案：data-i18n-attr="placeholder:key,aria-label:key2"；
     · 页面级 title / meta：body 挂 data-i18n-page="<页名>"，词典 pages.<页名>.*
       提供 en/ja 的 title 与 description；详情页是数据文案，不挂此属性、不换标题；
     · 动态渲染的文案（卡片计数、排序下拉、空状态等）由页面脚本调
       SiteLang.fmt(key, 中文兜底, 变量) 取词，并监听 document 的 site:langchange 重渲染；
     · 发布页面的 data-site-lang 固定 URL 对应的语言，菜单跳转到语言版本；
       旧 ?lang= 链接兼容跳转。未标记的开发页面仍支持原地切换。
   内容数据保留原文；英文展示时统一其中的角色名与站名，署名和链接不翻译。 */

(function () {
  "use strict";

  var STORAGE_KEY = "bluedafeiyu-lang";
  var CHANGE_EVENT = "site:langchange";

  var LANGS = [
    { id: "zh", label: "简体中文", title: "简体中文", htmlLang: "zh-CN" },
    { id: "zh-Hant", label: "繁體中文", title: "繁體中文", htmlLang: "zh-Hant" },
    { id: "en", label: "English", title: "English", htmlLang: "en" },
    { id: "ja", label: "日本語", title: "日本語", htmlLang: "ja" }
  ];

  var DICT = window.SiteMessages ||= {};

  /* 各页 title / description（en / ja）按 body[data-i18n-page] 取用 */
  var PAGES = {
    index: true, category: true, topics: true, submit: true, about: true, characters: true, community: true, search: true,
    projects: true, changelog: true, notfound: true, event: true
  };

  // ---------- 语言检测与持久化 ----------
  function normalize(raw) {
    var text = String(raw || "").trim().toLowerCase().replace(/_/g, '-');
    if (text.indexOf("en") === 0) return "en";
    if (text.indexOf("ja") === 0 || text.indexOf("jp") === 0) return "ja";
    if (/^zh(?:-|$)/.test(text)) {
      if (text.indexOf('-hans') !== -1) return "zh";
      return /-(?:hant|tw|hk|mo)(?:-|$)/.test(text) ? "zh-Hant" : "zh";
    }
    return "";
  }

  function detect() {
    var pageLanguage = normalize(document.documentElement.getAttribute('data-site-lang'));
    if (pageLanguage) return pageLanguage;
    try {
      var fromUrl = normalize(new URLSearchParams(window.location.search).get("lang"));
      if (fromUrl) {
        try { window.localStorage.setItem(STORAGE_KEY, fromUrl); } catch (err) { /* 隐私模式等：只影响记忆 */ }
        return fromUrl;
      }
      var saved = normalize(window.localStorage.getItem(STORAGE_KEY));
      if (saved) return saved;
    } catch (err) { /* localStorage 不可用：继续浏览器语言检测 */ }
    var candidates = window.navigator.languages || [window.navigator.language || ""];
    for (var i = 0; i < candidates.length; i += 1) {
      var hit = normalize(candidates[i]);
      if (hit) return hit;
    }
    return "zh";
  }

  var bakedLanguage = normalize(document.documentElement.getAttribute('data-site-lang'));
  var initial = detect();
  var current = bakedLanguage || (initial === 'zh-Hant' ? 'zh' : initial);
  var originals = new WeakMap(); // element -> { text, attrs: { attr: value } }
  var converter, converterPromise, requested = initial, switcher, notice = '';
  var dictionaryLoads = {};
  function loadDictionary(id) {
    if (DICT[id]) return Promise.resolve();
    if (!dictionaryLoads[id]) {
      dictionaryLoads[id] = new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = '/lang/' + id + '.js';
        script.onload = function () { if (DICT[id]) resolve(); else reject(new Error('Missing language dictionary')); };
        script.onerror = function () { script.remove(); reject(new Error('Language dictionary failed to load')); };
        document.head.appendChild(script);
      }).catch(function (error) { delete dictionaryLoads[id]; throw error; });
    }
    return dictionaryLoads[id];
  }
  var traditionalOverrides = {
    'd.specialThanks': '特別致謝',
    'd.links.project.ai-chan-sheets.description': '角色三視圖、表情、服裝與道具素材。',
    'about.license.p1b': '程式碼',
    'v2.nav.gallery': '圖庫',
    'v2.tagline': 'AI 娘二創圖庫'
  };

  // OpenCC's literary 孃 is not the community's character name spelling.
  function traditional(text) { return converter ? converter(String(text == null ? '' : text)).replace(/孃/g, '娘') : text; }
  function loadTraditional() {
    if (converter) return Promise.resolve();
    if (window.OpenCC) { converter = window.OpenCC.Converter({ from: 'cn', to: 'twp' }); return Promise.resolve(); }
    if (converterPromise) return converterPromise;
    converterPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = '/vendor/opencc/cn2t-1.4.2.js';
      script.async = true;
      script.onload = function () {
        try { converter = window.OpenCC.Converter({ from: 'cn', to: 'twp' }); resolve(); }
        catch (err) { converterPromise = null; reject(err); }
      };
      script.onerror = function () { script.remove(); converterPromise = null; reject(new Error('Traditional Chinese resource failed to load')); };
      document.head.appendChild(script);
    });
    return converterPromise;
  }

  // ---------- 取词 ----------
  // 英文角色名与站名共用一套规则；原始档案、链接和其他语言保留原文。
  var englishNames = {
    '蓝色大肥鱼': 'DeepSeek Chan', '藍色大肥魚': 'DeepSeek Chan', 'Blue Fish': 'DeepSeek Chan',
    'DeepSeek娘': 'DeepSeek Chan', '鲸娘': 'DeepSeek Chan', '鯨娘': 'DeepSeek Chan', '鲸鱼娘': 'DeepSeek Chan', '鯨魚娘': 'DeepSeek Chan',
    '豆包娘': 'Doubao Chan', 'Kimi娘': 'Kimi Chan',
    '通义千问娘': 'Qwen Chan', '通義千問娘': 'Qwen Chan', '千问娘': 'Qwen Chan', '千問娘': 'Qwen Chan', 'Qwen娘': 'Qwen Chan',
    'Claude娘': 'Claude Chan', 'Gemini娘': 'Gemini Chan', 'Grok娘': 'Grok Chan',
    'Stepfun娘': 'StepFun Chan', 'StepFun娘': 'StepFun Chan', '阶跃星辰娘': 'StepFun Chan',
    'GLM娘': 'GLM Chan', 'GPT娘': 'GPT Chan', 'ChatGPT娘': 'GPT Chan', 'MiMo娘': 'MiMo Chan',
    'MiniMax娘': 'MiniMax Chan', 'Mistral娘': 'Mistral Chan', 'Llama娘': 'Llama Chan',
    'Perplexity娘': 'Perplexity Chan', 'RWKV娘': 'RWKV Chan', '混元HY娘': 'Hunyuan Chan',
    'Git三姐妹': 'Git Sisters', 'NovelAI娘': 'NovelAI Chan', 'HuggingFace娘': 'Hugging Face Chan',
    'Zcode娘': 'Zcode Chan', 'OpenCode娘': 'OpenCode Chan'
  };
  // 少数角色名在日文里有独立写法（不走 Chan → ちゃん 的规则）。
  var japaneseNames = { 'Git三姐妹': 'Git三姉妹' };
  var englishNameLookup = {};
  Object.keys(englishNames).forEach(function (name) { englishNameLookup[name.toLowerCase()] = englishNames[name]; });
  var englishNamePattern = new RegExp(Object.keys(englishNames).sort(function (a, b) { return b.length - a.length; }).map(function (name) { return name.replace(/娘$/, '\\s*娘'); }).join('|'), 'gi');
  function translateNames(text) {
    var value = String(text == null ? '' : text);
    if (current !== 'en' && current !== 'ja') return value;
    return value.replace(englishNamePattern, function (name, offset, original) {
      if (/^\.[a-z]{2,}\b/i.test(original.slice(offset + name.length))) return name;
      var target = englishNameLookup[name.replace(/\s+娘$/, '娘').toLowerCase()];
      var canonicalName = name.replace(/\s+娘$/, '娘');
      if (current === 'ja' && japaneseNames[canonicalName]) return japaneseNames[canonicalName];
      return current === 'ja' && !/^(?:蓝色大肥鱼|藍色大肥魚|Blue Fish)$/i.test(name) ? target.replace(/ Chan$/, 'ちゃん') : target;
    })
      .replace(/\b(DeepSeek|Doubao|Kimi|Qwen|Claude|Gemini|Grok|StepFun|GLM|GPT|ChatGPT|MiMo|MiniMax|Mistral|Llama|Perplexity|RWKV|Hunyuan|NovelAI|Hugging ?Face|Zcode|OpenCode)[ -]chan\b/gi, function (whole, name) {
        if(current === 'ja' && whole === 'DeepSeek Chan') return whole;
        var canonical = Object.values(englishNames).find(function (value) { return value.toLowerCase() === name.toLowerCase() + ' chan'; });
        return current === 'ja' ? (canonical || name + ' Chan').replace(/ Chan$/, 'ちゃん') : (canonical || name + ' Chan');
      });
  }

  function contentText(text) {
    var value = String(text == null ? '' : text);
    if (current === 'zh-Hant') return traditional(value);
    if (current !== 'en' && current !== 'ja') return value;
    var n=0, key=value.trim().replace(/\d+(?:[.,]\d+)*/g,function(){return '{n'+n+++'}';});
    var entry=window.ArchiveCopy && window.ArchiveCopy.texts && window.ArchiveCopy.texts[key];
    var tag=window.ArchiveCopy && window.ArchiveCopy.tags && window.ArchiveCopy.tags[value.trim()];
    var numbers=value.match(/\d+(?:[.,]\d+)*/g)||[];
    return entry && entry[current] ? entry[current].replace(/\{n(\d+)\}/g,function(_,i){return numbers[i]||'';}) : tag && tag[current] ? tag[current] : translateNames(value);
  }
  function characterName(id, fallback) {
    var entry=window.ArchiveCopy && window.ArchiveCopy.characters && window.ArchiveCopy.characters[id];
    return entry && entry[current] ? entry[current] : contentText(fallback);
  }
  function localWork(work) {
    var entry=work.i18n && work.i18n[current];
    var roles=work.roles && work.roles.map(function(role){return Object.assign({},role,{name:characterName(role.id,role.name)});});
    if (entry) return Object.assign({},work,{roles:roles,n:entry.name,d:entry.description,cm:entry.commentary,c:characterName(work.cid,work.c),tg:entry.tags,sourceTags:work.tg,ln:entry.licenseNote});
    if (current === 'zh-Hant') return Object.assign({},work,{roles:roles,n:traditional(work.n),d:traditional(work.d),cm:traditional(work.cm),c:traditional(work.c),tg:work.tg.map(traditional),sourceTags:work.tg});
    return work;
  }

  function interpolate(text, params) {
    if (!params) return String(text);
    return String(text).replace(/\{(\w+)\}/g, function (whole, name) {
      if (name === "kindId") {
        var kindId = String(params.kindId || "meme");
        return lookup("kind." + kindId, kindId);
      }
      if (params[name] === undefined) return whole;
      var value = String(params[name]);
      if (current === 'zh-Hant') return traditional(value);
      return ['creator', 'credit', 'author'].includes(name) ? value : contentText(value);
    });
  }

  function lookup(key, fallback) {
    if (current === 'zh-Hant') {
      if (Object.prototype.hasOwnProperty.call(traditionalOverrides, key)) return traditionalOverrides[key];
      if (key === 'alt.work' && !fallback) return '《{name}》{character}{kindId}，AI 娘二創作品';
      return traditional(fallback);
    }
    if (current !== "zh") {
      var labels = window.ArchiveLabels && window.ArchiveLabels[current];
      if (labels && Object.prototype.hasOwnProperty.call(labels, key)) return translateNames(labels[key]);
      var table = DICT[current];
      if (table && Object.prototype.hasOwnProperty.call(table, key)) return translateNames(table[key]);
    }
    return contentText(fallback);
  }

  function fmt(key, fallback, params) {
    return interpolate(lookup(key, fallback), params);
  }

  // ---------- 应用翻译 ----------
  function cacheOriginal(el) {
    if (!originals.has(el)) {
      originals.set(el, { text: el.textContent, attrs: {} });
    }
    return originals.get(el);
  }

  function applyElement(el) {
    var original = cacheOriginal(el);
    var tplKey = el.getAttribute("data-i18n-tpl");
    var plainKey = el.getAttribute("data-i18n");
    var vars = null;
    var rawVars = el.getAttribute("data-i18n-vars");
    if (rawVars) {
      try { vars = JSON.parse(rawVars); } catch (err) { vars = null; }
    }
    if (tplKey) {
      el.textContent = current === "zh" ? original.text : fmt(tplKey, original.text, vars);
    } else if (plainKey) {
      el.textContent = current === "zh" ? original.text : lookup(plainKey, original.text);
    }
    var attrSpec = el.getAttribute("data-i18n-attr");
    if (attrSpec) {
      String(attrSpec).split(",").forEach(function (pair) {
        var parts = pair.split(":");
        var attr = String(parts[0] || "").trim();
        var key = String(parts[1] || "").trim();
        if (!attr || !key) return;
        if (!Object.prototype.hasOwnProperty.call(original.attrs, attr)) {
          original.attrs[attr] = el.getAttribute(attr);
        }
        if (current === "zh") {
          el.setAttribute(attr, original.attrs[attr] == null ? "" : original.attrs[attr]);
        } else {
          var fallback = original.attrs[attr] == null ? "" : original.attrs[attr];
          el.setAttribute(attr, fmt(key, fallback, vars));
        }
      });
    }
  }

  function applyPageMeta() {
    var page = document.body ? document.body.getAttribute("data-i18n-page") : null;
    if (!page || !PAGES[page]) return;
    if (!applyPageMeta.cached) applyPageMeta.cached = {};
    var cache = applyPageMeta.cached;
    if (!cache[page]) {
      cache[page] = {
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.getAttribute('content') || "",
        ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content') || "",
        ogDescription: document.querySelector('meta[property="og:description"]')?.getAttribute('content') || ""
      };
    }
    var original = cache[page];
    if (current === "zh" || current === 'zh-Hant') {
      var convert = current === 'zh-Hant' ? traditional : function (value) { return value; };
      document.title = convert(original.title);
      setMeta('meta[name="description"]', convert(original.description));
      setMeta('meta[property="og:title"]', convert(original.ogTitle));
      setMeta('meta[property="og:description"]', convert(original.ogDescription));
      return;
    }
    var table = DICT[current] || {};
    var title = table["page." + page + ".title"];
    var description = table["page." + page + ".desc"];
    if (title) document.title = translateNames(title);
    setMeta('meta[name="description"]', translateNames(description));
    setMeta('meta[property="og:title"]', translateNames(title));
    setMeta('meta[property="og:description"]', translateNames(description));
  }

  function setMeta(selector, value) {
    if (!value) return;
    var el = document.querySelector(selector);
    if (el) el.setAttribute("content", value);
  }

  function apply() {
    // 独立 URL 的 HTML 已在构建期翻译；运行时只负责动态文案。
    if (bakedLanguage === current) return;
    var nodes = document.querySelectorAll("[data-i18n],[data-i18n-tpl],[data-i18n-attr]");
    for (var i = 0; i < nodes.length; i += 1) applyElement(nodes[i]);
    var htmlLang = "zh-CN";
    for (var j = 0; j < LANGS.length; j += 1) {
      if (LANGS[j].id === current) htmlLang = LANGS[j].htmlLang;
    }
    document.documentElement.lang = htmlLang;
    applyPageMeta();
  }

  function mountMenus() {
    var box = document.getElementById('language-picker');
    if (!box || switcher) return;
    var trigger = document.getElementById('lang');
    var menu = document.getElementById('language-options');
    var items = Array.from(menu.querySelectorAll('[role="option"]'));
    switcher = { trigger: trigger, menu: menu, label: trigger.querySelector('span'), items: items, status: document.getElementById('language-status') };
    function close(restore) {
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      if (restore) trigger.focus({preventScroll: true});
    }
    function open(index) {
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      items[index].focus({preventScroll: true});
    }
    function choose(item) {
      close(true);
      setLang(item.getAttribute('data-value'));
    }
    trigger.addEventListener('click', function () {
      if (menu.hidden) open(Math.max(0, items.findIndex(item => item.getAttribute('aria-selected') === 'true')));
      else close(true);
    });
    items.forEach(item => item.addEventListener('click', () => choose(item)));
    box.addEventListener('keydown', function (event) {
      var index = items.indexOf(document.activeElement), key = event.key;
      if (key === 'Escape' && !menu.hidden) {
        event.preventDefault();
        event.stopPropagation();
        close(true);
      } else if (key === 'ArrowDown' || key === 'ArrowUp') {
        event.preventDefault();
        var direction = key === 'ArrowDown' ? 1 : -1;
        open(menu.hidden ? (direction === 1 ? 0 : items.length - 1) : (index + direction + items.length) % items.length);
      } else if (!menu.hidden && (key === 'Home' || key === 'End')) {
        event.preventDefault();
        open(key === 'Home' ? 0 : items.length - 1);
      } else if (!menu.hidden && index >= 0 && (key === 'Enter' || key === ' ')) {
        event.preventDefault();
        choose(items[index]);
      } else if (!menu.hidden && key === 'Tab') close(true);
    });
    box.addEventListener('focusout', event => { if (!box.contains(event.relatedTarget)) close(false); });
    document.addEventListener('pointerdown', function (event) {
      if (!box.contains(event.target)) close(false);
    });
    document.addEventListener('site:drawerchange', () => close(false));
    refreshSwitcher();
  }

  function refreshSwitcher() {
    if (!switcher) return;
    var lang = LANGS.find(function (entry) { return entry.id === current; });
    var shortLabel = {zh:'简中', 'zh-Hant':'繁中', en:'EN', ja:'日本語'}[current];
    var busy = requested === 'zh-Hant' && !converter;
    switcher.label.textContent = shortLabel;
    switcher.trigger.setAttribute('aria-label', fmt('ui.switchLang', '切换语言') + ' · ' + lang.title);
    switcher.trigger.setAttribute('aria-busy', String(busy));
    switcher.menu.setAttribute('aria-label', fmt('ui.switchLang', '切换语言'));
    switcher.items.forEach(function (item) {
      item.setAttribute('aria-selected', String(normalize(item.getAttribute('data-value')) === current));
    });
    switcher.status.textContent = notice;
  }

  function commitLanguage(next, persist) {
    current = next;
    if (persist) { try { window.localStorage.setItem(STORAGE_KEY, current); } catch (err) { /* 忽略 */ } }
    apply();
    refreshSwitcher();
    document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { lang: current } }));
  }

  function setLang(id, persist) {
    var next = normalize(id);
    if (!next) return Promise.resolve();
    if (bakedLanguage && next !== current) {
      if (persist !== false) { try { window.localStorage.setItem(STORAGE_KEY, next); } catch (err) { /* 忽略 */ } }
      window.location.assign(languageUrl(next));
      return Promise.resolve();
    }
    requested = next; notice = ''; refreshSwitcher();
    var pending = next === 'zh-Hant' && !converter ? loadTraditional() :
      (next === 'en' || next === 'ja') && !DICT[next] ? loadDictionary(next) : null;
    if (!pending) {
      if (next !== current) commitLanguage(next, persist !== false);
      return Promise.resolve();
    }
    return pending.then(function () {
      if (requested === next) commitLanguage(next, persist !== false);
    }).catch(function () {
      if (requested !== next) return;
      requested = current;
      notice = next === 'zh-Hant' ? '繁體中文載入失敗，請重新選擇重試。' : 'Language could not load. Please try again.';
      refreshSwitcher();
    });
  }

  function languageUrl(id, href) {
    var next = normalize(id) || 'zh';
    var url = new URL(href || window.location.href, window.location.origin);
    var pathname = url.pathname.replace(/^\/(?:zh-hant|en|ja)(?=\/|$)/, '') || '/';
    if (pathname === '/index.html') pathname = '/';
    var prefix = next === 'zh' ? '' : next === 'zh-Hant' ? '/zh-hant' : '/' + next;
    url.searchParams.delete('lang');
    return prefix + pathname + url.search + url.hash;
  }

  // ---------- 对外接口 ----------
  window.SiteLang = {
    get current() { return current; },
    t: fmt,
    fmt: fmt,
    translateNames: translateNames,
    contentText: contentText,
    characterName: characterName,
    localWork: localWork,
    setLang: setLang,
    mountMenus: mountMenus,
    languageUrl: languageUrl,
    url: function (href) {
      if (!bakedLanguage) return href;
      var target = new URL(href, window.location.origin);
      if (target.origin !== window.location.origin && target.origin !== 'https://xn--pssy23gqgbz2d718b.com') return href;
      return languageUrl(current, href);
    }
  };

  function init() {
    var legacy = normalize(new URLSearchParams(window.location.search).get('lang'));
    if (bakedLanguage && legacy) { window.location.replace(languageUrl(legacy)); return; }
    apply();
    mountMenus();
    setLang(initial, false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
