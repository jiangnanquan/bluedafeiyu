// 社群页与关于页共用真实联系入口。QQ 群仅提供邀请按钮和二维码。
import { SITE } from '../../lib/v2.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s]);
const span = (key, zh) => `<span data-i18n="d.community.${key}">${esc(zh)}</span>`;

// 繁体由站内 OpenCC 转换；英、日词典在 archive.mjs 初始化时统一注册。
export const COMMUNITY_CONTACT_COPY = {
  live: ['即时交流', 'Live chat', 'リアルタイムの交流'],
  discordText: [
    '聊新图、分享二创、参与站点建议，和国内外同好一起讨论 AI 娘的设定与作品。',
    'Share new works, fan art and site suggestions, and discuss AI girl designs with fans around the world.',
    '新しい作品や二次創作、サイトへの意見を共有し、世界のファンとAI娘の設定や作品について話しましょう。'
  ],
  discordJoin: ['加入 Discord', 'Join Discord', 'Discord に参加'],
  qqTitle: ['QQ 群', 'QQ group', 'QQグループ'],
  qqText: [
    '蓝色大肥鱼 · 点击按钮或扫描二维码加入，一起聊图、分享二创。',
    'Blue Dafeiyu · Use the invite button or scan the QR code to join and share fan art.',
    '藍色大肥魚 · 招待ボタンまたはQRコードから参加して、作品や二次創作について話しましょう。'
  ],
  qqJoin: ['加入 QQ 群', 'Join the QQ group', 'QQグループに参加'],
  qqQrAlt: ['QQ 群「蓝色大肥鱼」的加入二维码', 'QR code to join the Blue Dafeiyu QQ group', 'QQグループ「藍色大肥魚」に参加するためのQRコード'],
  wechatTitle: ['微信公众号', 'WeChat Official Account', 'WeChat公式アカウント'],
  wechatScan: ['微信扫码关注，获取更新与精选二创。', 'Scan with WeChat for updates and selected fan art.', 'WeChatでQRコードを読み取ると、更新情報や二次創作の紹介を受け取れます。'],
  wechatQrAlt: ['微信公众号关注二维码', 'WeChat Official Account follow QR code', 'WeChat公式アカウントのフォロー用QRコード']
};

export function registerCommunityContacts(translations) {
  for (const [key, row] of Object.entries(COMMUNITY_CONTACT_COPY)) {
    translations.en['d.community.' + key] = row[1];
    translations.ja['d.community.' + key] = row[2];
  }
}

const discordIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.6 5.6A16 16 0 0 0 15.7 4.4l-.3.6a12 12 0 0 1 3.4 1.2 11.4 11.4 0 0 0-9.6 0 12 12 0 0 1 3.4-1.2l-.3-.6A16 16 0 0 0 4.4 5.6C1.9 9.4 1.2 13.2 1.5 17a16 16 0 0 0 4.8 2.4l.6-1a10 10 0 0 1-1.7-.8l.4-.3a11.5 11.5 0 0 0 9.8 0l.4.3c-.5.3-1.1.6-1.7.8l.6 1a16 16 0 0 0 4.8-2.4c.4-4.4-.7-8.2-2.9-11.4ZM8.6 14.8c-.9 0-1.7-.8-1.7-1.9s.7-1.9 1.7-1.9 1.7.9 1.7 1.9-.8 1.9-1.7 1.9Zm6.8 0c-.9 0-1.7-.8-1.7-1.9s.7-1.9 1.7-1.9 1.7.9 1.7 1.9-.8 1.9-1.7 1.9Z"/></svg>';

export function communityContacts({ compact = false } = {}) {
  const { discord, qq, wechat } = SITE.community;
  return `<div class="join-layout${compact ? ' join-layout--compact' : ''}" data-community-contacts>
    <article class="join-main" data-community-channel="discord">
      <span class="join-logo">${discordIcon}</span>
      <span class="join-pill">${span('live', COMMUNITY_CONTACT_COPY.live[0])}</span>
      <h3>${esc(discord.name)}</h3>
      <p>${span('discordText', COMMUNITY_CONTACT_COPY.discordText[0])}</p>
      <div class="join-main-foot"><a class="button join-main-btn" href="${esc(discord.url)}" target="_blank" rel="noopener noreferrer">${span('discordJoin', COMMUNITY_CONTACT_COPY.discordJoin[0])}<span aria-hidden="true">↗</span></a></div>
    </article>
    <div class="join-side">
      <article class="join-row" data-community-channel="qq">
        <div class="join-row-copy"><h3>${span('qqTitle', COMMUNITY_CONTACT_COPY.qqTitle[0])}</h3><p>${span('qqText', COMMUNITY_CONTACT_COPY.qqText[0])}</p><div class="join-acts"><a class="button join-button" href="${esc(qq.url)}" target="_blank" rel="noopener noreferrer">${span('qqJoin', COMMUNITY_CONTACT_COPY.qqJoin[0])}<span aria-hidden="true">↗</span></a></div></div>
        <a class="join-qr-link" href="${esc(qq.url)}" target="_blank" rel="noopener noreferrer"><img class="join-qr" src="${esc(qq.qr)}" width="${qq.qrWidth}" height="${qq.qrHeight}" alt="${esc(COMMUNITY_CONTACT_COPY.qqQrAlt[0])}" data-i18n-attr="alt:d.community.qqQrAlt" loading="lazy" decoding="async" /></a>
      </article>
      ${wechat ? `<article class="join-row" data-community-channel="wechat"><div class="join-row-copy"><h3>${span('wechatTitle', COMMUNITY_CONTACT_COPY.wechatTitle[0])}</h3><p>${span('wechatScan', COMMUNITY_CONTACT_COPY.wechatScan[0])}</p></div><img class="join-qr" src="${esc(wechat.qr)}" width="${wechat.qrWidth}" height="${wechat.qrHeight}" alt="${esc(COMMUNITY_CONTACT_COPY.wechatQrAlt[0])}" data-i18n-attr="alt:d.community.wechatQrAlt" loading="lazy" decoding="async" /></article>` : ''}
    </div>
  </div>`;
}
