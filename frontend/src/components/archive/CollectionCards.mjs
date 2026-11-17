export function createCollectionCards(ctx) {
  const {esc,old,icon,tr}=ctx;
  const collectionCard=(topic,{download=true,compact=false}={})=>{
    const href='/topics/'+esc(topic.id)+'.html';
    const art=(topic.art||topic.list.slice(0,3)).filter(Boolean),cover=art[0];
    const image=(work,cls='',alt='')=>work?`<img class="${cls}" src="${esc(work.i)}" width="${work.p?.[0]||work.w}" height="${work.p?.[1]||work.h}" alt="${esc(alt)}" loading="lazy" decoding="async">`:'<span></span>';
    if(compact)return `<a class="topic-mini" data-collection-id="${esc(topic.id)}" href="${href}">${image(cover,'',topic.name)}<b>${esc(topic.name)}</b></a>`;
    return `<article class="coll-row collection-download-card"><a class="coll-covers" data-collection-id="${esc(topic.id)}" href="${href}" aria-label="${esc(topic.name)}">${image(cover,'coll-cover-main',topic.name)}<div class="coll-cover-side">${image(art[1])}${image(art[2])}</div></a><div class="coll-info"><span class="coll-badge">${topic.reader?tr('comic.serial','连载漫画','COMIC SERIES','連載漫画'):topic.author?tr('creatorCollection','作者作品集','Creator collection','作者の作品集'):tr('curatedCollection','主题精选','Curated collection','テーマコレクション')}</span><h2><a href="${href}">${esc(topic.name)}</a></h2><p>${esc(topic.summary)}</p><div class="coll-foot"><a class="coll-count" href="${href}">${topic.list.length} ${old('v2.work','作品')} →</a>${download?`<button class="button coll-zip" type="button" data-download-topic="${esc(topic.id)}">${icon('download',16)}${tr('zipDownload','打包下载原图','Download originals ZIP','元画像をZIPでダウンロード')}</button>`:''}</div></div></article>`;
  };
  return {collectionCard};
}
