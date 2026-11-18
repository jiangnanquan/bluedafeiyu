import {videoCoverAttributes} from './video-cover.mjs';
import {renderPagedFeed} from './PagedFeed.mjs';
import {videoArchive} from '../../lib/video-archive.mjs';
import {videoCopy} from '../../lib/video-copy.mjs';

const dateFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
export const VIDEO_PAGE_SIZE = 24;

function videoPageURL(page, order) {
  if (order === 'oldest') return page === 1 ? '/videos/oldest.html' : `/videos/oldest/page/${page}.html`;
  return page === 1 ? '/videos.html' : `/videos/page/${page}.html`;
}

export function renderVideoCard(ctx, video, creator) {
  const {esc}=ctx;
  return `<article class="video-card" data-video-bvid="${esc(video.bvid)}" data-published="${esc(video.publishedAt)}"><a class="video-cover" href="${esc(video.url)}" target="_blank" rel="noopener noreferrer"><img ${videoCoverAttributes(video.cover,esc,'(max-width:560px) 92vw, (max-width:820px) 44vw, (max-width:1240px) 28vw, 22vw')} width="480" height="270" alt="${esc(video.title)}" data-video-cover-alt loading="lazy" decoding="async"></a><a class="video-title" href="${esc(video.url)}" target="_blank" rel="noopener noreferrer" data-video-title>${esc(video.title)}</a><p class="video-description" data-video-description hidden>${esc(video.description||'')}</p><div class="video-meta"><a class="video-author" href="/creators/bilibili-${esc(video.uid)}.html"><span data-creator-name>${esc(creator?.name||'Bilibili')}</span></a><time datetime="${esc(video.publishedAt)}">${dateFormat.format(new Date(video.publishedAt))}</time></div></article>`;
}

export function renderVideoArchive(ctx, archive, {page=1, order='latest'}={}) {
  const {tr,pageHead}=ctx;
  const creators=new Map(archive.creators.map(c=>[c.uid,c]));
  const direction = order === 'oldest' ? 1 : -1;
  const videos=[...archive.videos].sort((a,b)=>direction*(Date.parse(a.publishedAt)-Date.parse(b.publishedAt)) || a.bvid.localeCompare(b.bvid));
  const visible = videos.slice((page-1)*VIDEO_PAGE_SIZE,page*VIDEO_PAGE_SIZE);
  const pages = Math.ceil(videos.length/VIDEO_PAGE_SIZE);
  const latest = tr('videoLatest','最新发布','Newest first','新しい順');
  const oldest = tr('videoOldest','最早发布','Oldest first','古い順');
  const sortLink = (key,label)=>`<a class="chip" href="${videoPageURL(1,key)}"${order===key?' aria-current="true"':''}>${label}</a>`;
  const pager = pages > 1 ? `<nav class="pagination" aria-label="视频分页" data-i18n-attr="aria-label:d.videoArchive.pagination">
    ${page>1?`<a rel="prev" href="${videoPageURL(page-1,order)}">${tr('videoArchive.prev','上一页','Previous page','前のページ')}</a>`:''}
    <span>${page} / ${pages}</span>
    ${page<pages?`<a rel="next" href="${videoPageURL(page+1,order)}">${tr('videoArchive.next','下一页','Next page','次のページ')}</a>`:''}
  </nav>` : '';
  tr('videoArchive.pagination','视频分页','Video archive pages','動画ページ');
  tr('videoArchive.sort','视频排序','Video sort order','動画の並び順');
  return `<div class="video-archive">${pageHead('VIDEO ARCHIVE',tr('videoArchive.heading','视频作品','Video works','動画作品'),tr('videoArchive.lead',`已收录 ${videos.length} 条 AI 娘二创视频、手书与角色动画，点击封面直达 Bilibili 原片。`,`Explore ${videos.length} AI girl fan videos and character animations. Open a cover to watch the original on Bilibili.`,`${videos.length}本のAI娘の二次創作動画やアニメーションを収録。サムネイルからBilibiliの元動画へ移動できます。`))}
    <aside class="video-banner"><div><h2>${tr('design.registerQuestion','你是 AI 娘视频创作者吗？','Creating AI girl videos?','AI娘の動画を制作していますか？')}</h2><p>${tr('videoArchive.registerLead','登记自己的 Bilibili 主页，通过审核的公开作品会收录到这里。','Register your Bilibili profile to have approved public videos included here.','ご自身のBilibiliプロフィールを登録すると、審査を通過した公開作品がここに掲載されます。')}</p></div><a class="button primary video-archive-register" href="/submit-video.html">${tr('videoArchive.register','登记创作者主页','Register a creator profile','作者のプロフィールを登録')} →</a></aside>
    <div class="video-toolbar"><span>${tr('videoArchive.title','视频作品','Videos','動画')} · ${videos.length} · ${tr('videoArchive.watch','点击前往 B 站','Watch on Bilibili','Bilibiliで視聴')}</span><nav class="chips" aria-label="视频排序" data-i18n-attr="aria-label:d.videoArchive.sort">${sortLink('latest',latest)}${sortLink('oldest',oldest)}</nav></div>
    <div class="video-grid" data-video-grid>${visible.map(v=>renderVideoCard(ctx,v,creators.get(v.uid))).join('')}</div>${videos.length?pager:`<p>${tr('videoEmpty',...videoCopy.videoEmpty)}</p>`}
  </div>`;
}

export function createVideoPages(ctx) {
  const {esc,tr,write,pageHead}=ctx;
  const byUid=new Map(videoArchive.creators.map(c=>[c.uid,c]));
  const card=v=>renderVideoCard(ctx,v,byUid.get(v.uid));
  const cards=list=>renderPagedFeed(list.map(card),{label:tr('feedLoadMore','加载更多','Load more','もっと見る')});
  const pages = Math.max(1,Math.ceil(videoArchive.videos.length/VIDEO_PAGE_SIZE));
  for (const order of ['latest','oldest']) for (let page=1;page<=pages;page++) {
    const title=page===1 && order==='latest' ? videoCopy.videoTitle[0] : `视频作品 · ${order==='oldest'?'最早发布 · ':''}第 ${page} 页`;
    write(videoPageURL(page,order),title,'videos',renderVideoArchive(ctx,videoArchive,{page,order}),{
      desc:videoCopy.videoLead[0],attrs:`data-video-archive data-video-page="${page}" data-video-order="${order}"`,
      ...(order==='oldest'?{robots:'noindex,follow'}:{})
    });
  }
  for(const creator of videoArchive.creators) {
    const list=videoArchive.videos.filter(v=>v.uid===creator.uid);
    write('/creators/bilibili-'+creator.uid+'.html',creator.name+' · '+videoCopy.creatorProfile[0],'creators',`${pageHead(tr('creatorProfile',...videoCopy.creatorProfile),`<span data-creator-name>${esc(creator.name)}</span>`)}<p data-creator-intro="${esc(creator.uid)}">${esc(creator.intro)}</p><p><a class="button" href="${esc(creator.homepage)}" target="_blank" rel="noopener noreferrer">${tr('creatorVisit',...videoCopy.creatorVisit)}</a></p>${cards(list)}`,{attrs:`data-creator-uid="${creator.uid}"`,desc:creator.name+' · '+creator.intro});
  }
  return {videoCards:cards,videoCard:card};
}
