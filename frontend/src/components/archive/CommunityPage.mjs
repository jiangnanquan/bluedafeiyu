import { SITE } from '../../lib/v2.mjs';
import { communityContacts } from '../library/CommunityContacts.mjs';
import { renderSectionHeading } from './PageHeading.mjs';

export function createCommunityPage(ctx) {
  const { esc, tr, old, icon, button, pageHead, write } = ctx;
  const heading = title => renderSectionHeading({title, variant:'bar'});
  const row = (symbol, title, description, href, label) => `<article class="row-item"><span class="join-icon">${icon(symbol,18)}</span><div class="row-copy"><h3>${title}</h3><p>${description}</p></div><a class="row-link" href="${href}">${label} <span aria-hidden="true">→</span></a></article>`;
  const check = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5 9-9"/></svg>';
  const shield = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>';
  const socialCard = (mark, name, detail, url) => `<a class="social-card" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><span class="join-icon">${mark}</span><div class="social-copy"><h3>${name}</h3><p>${esc(detail)}</p></div><span class="arrow" aria-hidden="true">↗</span></a>`;

  write('/community.html','社群','community',`<div class="community-page">
    ${pageHead('COMMUNITY',tr('communityTitle','来社群坐坐。','Come hang out with the community.','コミュニティで話しましょう。'),tr('communityLead','聊图、分享二创、参与活动，一起把这个档案整理好。','Share fan art, join events and help organize the archive.','作品を共有し、イベントに参加して、アーカイブを一緒に育てましょう。')+'<br>'+tr('communityPlatforms','Discord、QQ 群和微信公众号都在这里。','Find our Discord, QQ group and WeChat Official Account here.','Discord、QQグループ、WeChat公式アカウントはこちらです。'))}
    <section id="community-join" aria-labelledby="community-join-title">
      ${renderSectionHeading({title:`<span id="community-join-title">${tr('joinTitle','选择加入方式','Choose how to join','参加方法を選ぶ')}</span>`,description:tr('joinLead','三个入口长期开放，选你顺手的那个。','Three ways to keep in touch — choose what works for you.','使いやすい方法で、気軽にご参加ください。'),variant:'bar'})}
      ${communityContacts()}
    </section>
    <div class="engage-grid">
      <section class="engage-col">${heading(tr('groupSubmitFeedback','投稿与反馈','Submissions & feedback','投稿とフィードバック'))}<div class="row-list">
        ${row('upload',tr('groupImageSubmit','图片与 ZIP 投稿','Image & ZIP submissions','画像・ZIPの投稿'),tr('groupImageSubmitText','提交新图、表情包合集或角色设定图','Submit new images, meme packs or character sheets','新しい画像、スタンプ集、キャラクター設定を投稿'),'/submit.html',tr('groupSubmitAction','去投稿','Submit a work','投稿する'))}
        ${row('video',tr('groupVideoSubmit','视频作者登记','Video creator registration','動画作者の登録'),tr('groupVideoSubmitText','填写 UID 或主页链接，收录你的二创视频','Register your UID or profile to archive your fan videos','UIDまたはプロフィールURLで二次創作動画を登録'),'/submit-video.html',tr('groupVideoAction','开始登记','Register','登録する'))}
        ${row('book',tr('groupFeedback','一起整理档案','Help maintain the archive','アーカイブを一緒に整理'),tr('groupFeedbackText','补充来源、修正信息，反馈页面问题','Add sources, correct information or report page issues','出典の追加、情報の修正、不具合の報告'),'/about.html',tr('groupHelpAction','加入共建','Help the archive','整理に協力する'))}
      </div></section>
      <section class="engage-col">${heading(tr('groupEvents','活动与回顾','Events & recaps','イベントと記録'))}<article class="event-card"><div class="kv-kicker"><span>EVENTS</span></div><h3>${tr('groupEventTitle','每一份创作，都值得留下。','Every creation deserves a place.','一つひとつの創作を、記録に。')}</h3><p>${tr('groupEventsText','在活动页查看当期共创，或从往期目录回顾每一期活动的作品与记录。','Explore current collaborations or revisit works and records from past events.','開催中の共同制作や、過去のイベントの作品と記録をご覧ください。')}</p><div class="event-acts">${button('/events/current.html',tr('groupCurrentEvent','当期活动','Current event','開催中のイベント')+' →','primary')}${button('/events/archive.html',tr('groupPastEvents','往期回顾','Past events','過去のイベント')+' →')}</div></article></section>
    </div>
    <div class="rules-bar"><b>${shield}${old('v2.cm.rulesTitle','交流规则')}</b><ul><li>${check}${tr('groupRuleTopic','围绕 AI 娘与二创交流','Keep discussions about AI girls and fan art','AI娘と二次創作を中心に交流')}</li><li>${check}${tr('groupRuleCredit','转载注明出处，尊重原作者','Credit sources and respect creators','転載には出典を記載し、原作者を尊重')}</li><li>${check}${old('v2.cm.r3','不发真人肖像、不发 R18 内容、不刷屏。')}</li></ul></div>
    ${heading(tr('elsewhere','也可以在这里找到站长','Find the curator elsewhere','ほかの場所でも'))}
    <div class="social-grid">${SITE.social.map(item=>socialCard(item.id==='bili'?'B':'X',item.id==='bili'?old('v2.cm.bili','哔哩哔哩'):esc(item.name),item.handle,item.href)).join('')}${socialCard('GH','GitHub','lmy414/ai-girl-stickers',SITE.repoContent)}</div>
  </div>`);
}
