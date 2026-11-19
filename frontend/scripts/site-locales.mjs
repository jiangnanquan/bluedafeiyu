export const ORIGIN = 'https://xn--pssy23gqgbz2d718b.com';
export const LOCALES = [
  { id: 'zh', prefix: '', html: 'zh-CN', hreflang: 'zh-Hans', og: 'zh_CN', label: '简体中文' },
  { id: 'zh-Hant', prefix: '/zh-hant', html: 'zh-Hant', hreflang: 'zh-Hant', og: 'zh_TW', label: '繁體中文' },
  { id: 'en', prefix: '/en', html: 'en', hreflang: 'en', og: 'en_US', label: 'English' },
  { id: 'ja', prefix: '/ja', html: 'ja', hreflang: 'ja', og: 'ja_JP', label: '日本語' }
];
export const normalizeHome = value => value === '/index.html' ? '/' : value;
export const localizedPath = (base, locale) => locale.prefix + normalizeHome(base);
