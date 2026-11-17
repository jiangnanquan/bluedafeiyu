import {videoCoverAttributes} from './video-cover.mjs';
import {renderPagedFeed} from './PagedFeed.mjs';
import {videoArchive} from '../../lib/video-archive.mjs';
import {videoCopy} from '../../lib/video-copy.mjs';

const dateFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});

export function renderVideoCard(ctx, video, creator) {
  const {esc}=ctx;
  return `<article class="video-card" data-video-bvid="${esc(video.bvid)}" data-published="${esc(video.publishedAt)}"><a class="video-cover" href="${esc(video.url)}" target="_blank" rel="noopener noreferrer"><img ${videoCoverAttributes(video.cover,esc,'(max-width:560px) 92vw, (max-width:820px) 44vw, (max-width:1240px) 28vw, 22vw')} width="480" height="270" alt="${esc(video.title)}" data-video-cover-alt loading="lazy" decoding="async"></a><a class="video-title" href="${esc(video.url)}" target="_blank" rel="noopener noreferrer" data-video-title>${esc(video.title)}</a><p class="video-description" data-video-description hidden>${esc(video.description||'')}</p><div class="video-meta"><a class="video-author" href="/creators/bilibili-${esc(video.uid)}.html"><span data-creator-name>${esc(creator?.name||'Bilibili')}</span></a><time datetime="${esc(video.publishedAt)}">${dateFormat.format(new Date(video.publishedAt))}</time></div></article>`;
}

export function renderVideoArchive(ctx, archive) {
  const {tr,pageHead}=ctx;
  const creators=new Map(archive.creators.map(c=>[c.uid,c]));
  const videos=[...archive.videos].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
  return `<div class="video-archive">${pageHead('VIDEO ARCHIVE',tr('videoArchive.heading','视频作品','Video works','動画作品'),tr('videoArchive.lead',`已收录 ${videos.length} 条 AI 娘二创视频、手书与角色动画，点击封面直达 Bilibili 原片。`,`Explore ${videos.length} AI girl fan videos and character animations. Open a cover to watch the original on Bilibili.`,`${videos.length}本のAI娘の二次創作動画やアニメーションを収録。サムネイルからBilibiliの元動画へ移動できます。`))}
    <aside class="video-banner"><div><h2>${tr('design.registerQuestion','你是 AI 娘视频创作者吗？','Creating AI girl videos?','AI娘の動画を制作していますか？')}</h2><p>${tr('videoArchive.registerLead','登记自己的 Bilibili 主页，通过审核的公开作品会收录到这里。','Register your Bilibili profile to have approved public videos included here.','ご自身のBilibiliプロフィールを登録すると、審査を通過した公開作品がここに掲載されます。')}</p></div><a class="button primary video-archive-register" href="/submit-video.html">${tr('videoArchive.register','登记创作者主页','Register a creator profile','作者のプロフィールを登録')} →</a></aside>
    <div class="video-toolbar"><span>${tr('videoArchive.title','视频作品','Videos','動画')} · ${videos.length} · ${tr('videoArchive.watch','点击前往 B 站','Watch on Bilibili','Bilibiliで視聴')}</span><select class="filter-select" data-video-sort aria-label="排序方式" data-i18n-attr="aria-label:d.sortFilter"><option value="latest">${tr('videoLatest','最新发布','Newest first','新しい順')}</option><option value="oldest">${tr('videoOldest','最早发布','Oldest first','古い順')}</option></select></div>
    <div class="video-grid" data-video-grid>${videos.map(v=>renderVideoCard(ctx,v,creators.get(v.uid))).join('')}</div>${videos.length?'':`<p>${tr('videoEmpty',...videoCopy.videoEmpty)}</p>`}
  </div>`;
}

export function createVideoPages(ctx) {
  const {esc,tr,write,pageHead}=ctx;
  const byUid=new Map(videoArchive.creators.map(c=>[c.uid,c]));
  const card=v=>renderVideoCard(ctx,v,byUid.get(v.uid));
  const cards=list=>renderPagedFeed(list.map(card),{label:tr('feedLoadMore','加载更多','Load more','もっと見る')});
  write('/videos.html',videoCopy.videoTitle[0],'videos',renderVideoArchive(ctx,videoArchive),{desc:videoCopy.videoLead[0],attrs:'data-video-archive'});
  for(const creator of videoArchive.creators) {
    const list=videoArchive.videos.filter(v=>v.uid===creator.uid);
    write('/creators/bilibili-'+creator.uid+'.html',creator.name+' · '+videoCopy.creatorProfile[0],'creators',`${pageHead(tr('creatorProfile',...videoCopy.creatorProfile),`<span data-creator-name>${esc(creator.name)}</span>`)}<p data-creator-intro="${esc(creator.uid)}">${esc(creator.intro)}</p><p><a class="button" href="${esc(creator.homepage)}" target="_blank" rel="noopener noreferrer">${tr('creatorVisit',...videoCopy.creatorVisit)}</a></p>${cards(list)}`,{attrs:`data-creator-uid="${creator.uid}"`,desc:creator.name+' · '+creator.intro});
  }
  return {videoCards:cards,videoCard:card};
}
