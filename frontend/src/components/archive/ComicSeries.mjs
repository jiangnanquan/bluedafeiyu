export const comicPageURL = (id, number = 0) => '/topics/' + id + (number ? '/page/' + number : '') + '.html';

// Endpoints can render before lazy detail pages. Export this component's entire
// dictionary explicitly so every label is available before any page is rendered.
const copy = {
  author:['作者署名','Creator credit','作者クレジット'],
  beginning:['连载封面','Series cover','連載の表紙'],
  collections:['合集','Collections','コレクション'],
  contents:['页码目录','Page contents','ページ目次'],
  cover:['封面与目录','Cover & contents','表紙と目次'],
  coverImage:['封面','Cover','表紙'],
  details:['查看详情与原图','Details & original','詳細と元画像'],
  download:['打包下载已收录页','Download available pages','収録ページをZIPでダウンロード'],
  end:['本次投稿到此','End of this submission','今回の投稿はここまで'],
  keepNumbers:['保留原稿页码，缺页不会重新编号。','Original page numbers are preserved.','欠番を詰めず、原稿のページ番号を保持しています。'],
  missingBody:['本页暂未收录，可继续翻页。','This original page is not yet available. You can continue to the next page.','この原稿ページは未収録です。次のページに進めます。'],
  missingIntro:['以下原稿页暂未收录：','Original pages not yet available:','未収録の原稿ページ：'],
  next:['下一页','Next','次へ'],
  originalNumber:['原稿页码','Original page number','原稿ページ'],
  page:['原稿第','Original page','原稿'],
  pages:['页正文','pages','ページ'],
  pageSuffix:['页','','ページ'],
  previous:['上一页','Previous','前へ'],
  read:['按页阅读连载','Read the series','連載を読む'],
  serial:['连载漫画','COMIC SERIES','連載漫画'],
  unavailable:['暂未收录','Not yet available','未収録'],
  unavailableShort:['缺页','Missing','未収録']
};
export const comicTranslations = Object.fromEntries(['en','ja'].map((language,i)=>[language,Object.fromEntries(Object.entries(copy).map(([key,values])=>['d.comic.'+key,values[i+1]]))]));
const label = (ctx,key) => ctx.tr('comic.'+key,...copy[key]);

export function comicWorkNavigation(ctx, topic, work) {
  const page = topic.reader.pages.find(page => page.workId === work.id);
  if (!page && work.id !== topic.coverWorkId) return '';
  const number = page?.number || 0;
  return `<section class="section comic-work-navigation" data-comic-topic="${ctx.esc(topic.id)}"><h2>${ctx.esc(topic.name)}</h2><p>${ctx.tr('comic.originalNumber','原稿页码','Original page number','原稿ページ')} ${number || ctx.tr('comic.coverImage','封面','Cover','表紙')} / ${topic.reader.totalPages}</p><div class="detail-actions">${ctx.button(comicPageURL(topic.id,number),ctx.tr('comic.read','按页阅读连载','Read the series','連載を読む'),'primary')}${ctx.button(comicPageURL(topic.id),ctx.tr('comic.contents','页码目录','Page contents','ページ目次'))}</div></section>`;
}

export function createComicSeries(ctx,topic) {
  const {esc:e,tr,icon,button,breadcrumbs,write}=ctx;
  const t=key=>label(ctx,key),reader=topic.reader;
  const byId=new Map(topic.list.map(work=>[work.id,work]));
  const pages=new Map(reader.pages.map(page=>[page.number,byId.get(page.workId)]));
  const missing=Array.from({length:reader.totalPages},(_,i)=>i+1).filter(n=>!pages.get(n));
  const pageLabel=n=>`${t('page')} ${n} ${t('pageSuffix')}`;
  const missingNote=missing.length?`<p class="comic-availability">${t('missingIntro')} ${missing.join('、')} · ${t('keepNumbers')}</p>`:'';
  const author=topic.author;
  const uid=author?.channels?.map(channel=>channel.url.match(/space\.bilibili\.com\/(\d+)/)?.[1]).find(Boolean);
  const authorHref=author?'/creators/'+(uid?'bilibili-'+uid:topic.id)+'.html':'';
  const authorSource=author?.channels?.[0]?.url||author?.url||authorHref;
  const contents=number=>`<nav class="comic-pages" aria-label="${e(topic.name)}"><a href="${comicPageURL(topic.id)}" ${number===0?'aria-current="page"':''}>${t('cover')}</a>${Array.from({length:reader.totalPages},(_,i)=>i+1).map(n=>`<a href="${comicPageURL(topic.id,n)}" ${n===number?'aria-current="page"':''} ${pages.get(n)?'':'class="comic-missing-link"'}>${n}${pages.get(n)?'':`<small>${t('unavailableShort')}</small>`}</a>`).join('')}</nav>`;
  const unavailable=number=>`<section class="comic-unavailable"><h2>${number?pageLabel(number):t('coverImage')} · ${t('unavailable')}</h2><p>${t('missingBody')}</p></section>`;
  for(let number=0;number<=reader.totalPages;number++) {
    const work=number?pages.get(number):topic.cover;
    const trail=breadcrumbs([[tr('comic.archiveTitle','连载漫画','Comic series','連載漫画'),'/serials.html'],...(number?[[e(topic.name),comicPageURL(topic.id)]]:[]),[number?pageLabel(number):e(topic.name)]]);
    const image=(cls)=>work?`<figure class="${cls} comic-sheet" data-comic-work="${e(work.id)}"><img src="${e(work.l)}" width="${work.v?.[0]||work.w||480}" height="${work.v?.[1]||work.h||480}" alt="${e(work.n)}" fetchpriority="high" decoding="async"></figure>`:unavailable(number);
    let content;
    if(number===0) {
      const thumbs=Array.from({length:reader.totalPages},(_,i)=>i+1).map(n=>{
        const item=pages.get(n);
        return `<a class="page-cell${item?'':' comic-missing-link'}" href="${comicPageURL(topic.id,n)}">${item?`<img src="${e(item.i||item.l)}" width="${item.p?.[0]||item.w}" height="${item.p?.[1]||item.h}" alt="${e(item.n)}" loading="lazy">`:`<span>${t('unavailableShort')}</span>`}<span>P${String(n).padStart(2,'0')}</span></a>`;
      }).join('');
      content=`${trail}<section class="cd-hero" data-comic-reader="${e(topic.id)}" data-comic-page="0">${image('cd-portrait')}<div class="cd-head"><div class="eyebrow"><span>COMIC SERIES</span><i aria-hidden="true"></i></div><h1>${e(topic.name)}</h1><p class="cd-alias">${e(topic.summary)}</p><p class="serial-index-credits">${e(reader.credits||'')}</p><div class="cd-stats"><span><b>${reader.pages.length}</b> / ${reader.totalPages} ${t('pages')}</span>${author?`<a class="author-name" href="${e(authorSource)}" target="_blank" rel="noopener noreferrer">${e(author.name)}</a>`:''}</div><div class="cd-acts comic-intro-actions">${button(comicPageURL(topic.id,1),tr('comic.start','开始阅读','Start reading','読み始める'),'primary')}<button class="button" type="button" data-download-topic="${e(topic.id)}">${icon('download',16)}${t('download')}</button>${authorHref?button(authorHref,tr('comic.authorPage','作者主页','Creator profile','作者のページ')):''}</div></div></section>${missingNote}<div class="sec"><h2>${t('contents')}</h2><span>${t('keepNumbers')}</span></div><div class="page-grid" id="comic-contents">${thumbs}</div>`;
    } else {
      const nav=`<nav class="rd-nav comic-navigation" aria-label="${e(topic.name)}">${number>0?button(comicPageURL(topic.id,number-1),icon('back',16)+t('previous')):`<button class="button" type="button" disabled>${t('beginning')}</button>`}<span class="rd-end">${number} / ${reader.totalPages}</span>${number<reader.totalPages?button(comicPageURL(topic.id,number+1),t('next')+icon('arrow',16),'primary'):button(comicPageURL(topic.id),t('end'),'primary')}</nav>`;
      content=`${trail}<section data-comic-reader="${e(topic.id)}" data-comic-page="${number}"><div class="rd-top">${button(comicPageURL(topic.id),icon('back',16)+t('contents'))}${work?button('/works/'+work.slug+'.html',t('details')):''}<span class="rd-progress">${pageLabel(number)} / ${reader.totalPages}</span></div><div class="rd-head"><h1>${e(work?.n||topic.name)}${work?'':' · '+pageLabel(number)}</h1><span>${e(reader.credits||author?.name||'')}</span>${author?`<a class="author-name" href="${e(authorSource)}" target="_blank" rel="noopener noreferrer">${e(author.name)}</a>`:''}</div>${image('rd-stage')}${nav}<details class="comic-contents" id="comic-contents"><summary>${t('contents')}</summary>${contents(number)}</details></section>`;
    }
    write(comicPageURL(topic.id,number),topic.name,'serials',content,{comic:{topicId:topic.id,number},desc:topic.summary});
  }
}
