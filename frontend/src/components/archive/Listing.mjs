import {renderSectionHeading} from './PageHeading.mjs';
import {pageURL} from './SEO.mjs';

export function createListing(ctx) {
  const { works, chars, types, esc, tr, old, icon, grid, pageHead } = ctx;
  // `character` turns the bar into the role-library variant: the role and type
  // selects stay as hidden state (the page fixes the role, type tabs drive the
  // type), and search, creation method, sort and direction share one row.
  function filters(initialChar = '', initialType = '', initialSort = 'latest', list = works, character = null, variant = '') {
    const home = variant === 'home';
    const counts = new Map();
    for (const work of list) for (const id of work.cids || [work.cid]) counts.set(id, (counts.get(id) || 0) + 1);
    const roles = chars.filter(c => counts.has(c.id));
    const relevance = initialSort==='relevance' ? `<option value="relevance">${tr('relevance','最相关','Most relevant','関連度順')}</option>` : '';
    const hidden = character ? ' hidden' : '';
    const roleSelect = `<select name="character" multiple aria-label="角色筛选" data-i18n-attr="aria-label:d.roleFilter"${character?'':' aria-describedby="character-filter-help"'}${hidden}><option value="" ${!initialChar?'selected':''} data-i18n="d.allRoles">全部角色</option>${roles.map(c=>`<option value="${c.id}" ${c.id===initialChar?'selected':''}>${esc(c.name)} (${counts.get(c.id)})</option>`).join('')}</select>`;
    const typeSelect = `<select name="type" aria-label="类型筛选" data-i18n-attr="aria-label:d.typeFilter"${hidden}><option value="" data-i18n="d.allTypes">全部类型</option>${types.map(t=>`<option value="${t.id}" ${t.id===initialType?'selected':''} data-i18n="v2.type.${t.id}">${esc(t.name)}</option>`).join('')}</select>`;
    const creationSelect = `<select name="creation" aria-label="创作方式筛选" data-i18n-attr="aria-label:d.creationFilter" aria-describedby="creation-filter-help"><option value="">${tr('allCreation','全部创作','All works','すべての作品')}</option><option value="non-ai">${tr('nonAiFilter','非AI创作','Non-AI works','非AI作品')}</option></select>`;
    const timeLabel = home ? tr('gallery.latest','最新收录','Recently added','新着順') : tr('sortTime','时间','Time','日時');
    const sortSelect = `<select name="sort" aria-label="排序" data-i18n-attr="aria-label:d.sortFilter">${relevance}${initialSort==='curated'?`<option value="curated" selected data-i18n="d.curated">精选顺序</option>`:''}<option value="latest" ${initialSort==='latest'?'selected':''}>${timeLabel}</option><option value="popular" disabled>${tr('sortClicks','点击量','Views','閲覧数')}</option><option value="downloads" disabled>${tr('sortDownloads','下载量','Downloads','ダウンロード数')}</option><option value="random">${tr('sortRandom','随机','Random','ランダム')}</option></select>`;
    const directionSelect = `<select name="direction" aria-label="顺序" data-i18n-attr="aria-label:d.sortDirection"><option value="desc" ${initialSort==='curated'?'':'selected'}>${tr('sortDesc','倒序','Descending','降順')}</option><option value="asc" ${initialSort==='curated'?'selected':''}>${tr('sortAsc','正序','Ascending','昇順')}</option></select>`;
    const reset = `<button class="text-button" type="button" data-reset>${tr('clear','清除条件','Reset filters','条件をクリア')}</button>`;
    const creationHelp = tr('creationHelp','非 AI 创作仅收录手绘等非 AI 生成的相关二创，依据作者或投稿者说明标注；未标注不代表使用了 AI。','Non-AI works include hand-drawn and other non-AI-generated fan creations, based on the creator’s or submitter’s statement. Untagged works may also be non-AI.','非AI作品は、作者・投稿者の申告に基づく手描きなどのAI生成ではない二次創作です。タグがない作品も非AIの場合があります。');
    if (character) {
      tr('characterPage.search','搜索作品、作者或标签','Search works, creators or tags','作品・作者・タグを検索');
      return `<form class="filter-bar character-filter" id="filter-form">${roleSelect}${typeSelect}${character.tabs}<div class="character-filter-row"><input id="search-q" name="q" type="search" autocomplete="off" aria-label="搜索作品、作者或标签" placeholder="搜索作品、作者或标签" data-i18n-attr="aria-label:d.characterPage.search,placeholder:d.characterPage.search">${creationSelect}${sortSelect}${directionSelect}${reset}</div><p class="character-visually-hidden" id="creation-filter-help">${creationHelp}</p></form>`;
    }
    const roleHelp=tr('roleMatchAll','可多选：同时包含全部所选角色（AND）','Select multiple: match all selected characters (AND)','複数選択：選んだキャラクターすべてを含む作品（AND）');
    const chip=(id,label,count)=>`<button class="chip${initialType===id?' is-active':''}" type="button" data-catalog-type="${id}" aria-pressed="${initialType===id}">${label}${home?'':` (${count})`}</button>`;
    const gifLabel=tr('gifTitle','GIF 动图库','GIF archive','GIFアニメ');
    const chips=variant?`<div class="chips catalog-type-chips">${chip('',tr('allTypes','全部类型','All types','すべての種類'),list.length)}${types.map(type=>chip(type.id,old('v2.type.'+type.id,type.name),list.filter(work=>work.k.includes(type.id)).length)).join('')}${home?chip('gif','GIF'):`<a class="chip" href="/gifs.html">${gifLabel}</a>`}</div>`:'';
    const typeState=variant?typeSelect.replace('<select ','<select hidden '):typeSelect;
    if (home) {
      tr('gallery.tag','按标签筛选','Filter by tag','タグで絞り込む');
      return `<form class="catalog-filters gallery-filters" id="filter-form">${chips}<div class="catalog-filter-controls">${roleSelect}${typeState.replace('</select>','<option value="gif">GIF</option></select>')}<input class="gallery-tag" name="tag" type="search" list="gallery-tags" autocomplete="off" placeholder="按标签筛选" aria-label="按标签筛选" data-i18n-attr="placeholder:d.gallery.tag,aria-label:d.gallery.tag"><datalist id="gallery-tags"></datalist>${sortSelect}${reset}</div><div hidden>${creationSelect}${directionSelect}</div><p class="sr" id="character-filter-help">${roleHelp}</p><p class="sr" id="creation-filter-help">${creationHelp}</p></form>`;
    }
    return `<form class="filters catalog-filters" id="filter-form">${chips}<div class="catalog-filter-controls">${roleSelect}${typeState}${creationSelect}${sortSelect}${directionSelect}${reset}</div><details class="catalog-filter-guide"><summary>${tr('browseFilterGuide','筛选说明','Filter guide','絞り込みの説明')}</summary><p id="character-filter-help">${roleHelp}</p><p id="creation-filter-help">${creationHelp}</p><p>${tr('statsSnapshot','下载量指按钮点击次数','Downloads count button clicks','ダウンロード数はボタンのクリック数')}</p></details></form>`;
  }
  function results(list, page) {
    const sliced=list.slice((page-1)*24,page*24);
    return `<div id="results" data-list="${esc(JSON.stringify(list.map(w=>w.slug)))}">${grid(sliced,'',true)}</div><div class="load-more-wrap"><button class="button" type="button" data-load-more hidden>${tr('loadMore','再看一些','Load more','もっと見る')}</button></div>`;
  }
  function homeGallery(list) {
    const heading=tr('allWorks','全部图片','All images','画像一覧');
    const count=list.length.toLocaleString('en-US');
    const total=tr('gallery.count',`${count} 张图片`,`${count} images`,`画像 ${count} 枚`);
    return `<section class="home-gallery" aria-labelledby="gallery-title">${renderSectionHeading({title:`<span id="gallery-title">${heading}</span>`,extra:`<p id="result-count" aria-live="polite">${total}</p>`})}${filters('','','latest',list,null,'home')}${results(list,1)}${list.length>24?`<noscript><a class="button" href="${pageURL('/browse.html',2)}">${tr('loadMore','再看一些','Load more','もっと見る')}</a></noscript>`:''}</section>`;
  }
  function browsePage(list,base,title,type='',char='',n=1,intro='') {
    const page=Math.min(n,Math.max(1,Math.ceil(list.length/24)));
    const gif=base==='/gifs.html',category=base.startsWith('/categories/');
    const label=gif?'GIF ARCHIVE':category?'CATEGORY':'ARCHIVE';
    const lead=tr('browseLead','按角色、类型与排序筛选，点击图片可在当前页大图浏览。','Filter by character, type and order. Open an image to preview it on this page.','キャラクター、種類、並び順で絞り込み、画像を開くと同じページでプレビューできます。');
    const trail=gif||category?ctx.breadcrumbs([[tr('allWorks','全部图片','All images','画像一覧'),'/browse.html'],[title]]):'';
    return `${trail}${pageHead(label,title,lead)}${gif&&intro?`<aside class="note">${icon('image',20)}<p>${intro}</p></aside>`:''}${filters(char,type,base.startsWith('/topics/')?'curated':'latest',list,null,base==='/browse.html'?'catalog':'')}<p class="catalog-result" id="result-count" aria-live="polite">${list.length} ${old('v2.work','作品')}</p>${results(list,page)}`;
  }
  return {filters,browsePage,homeGallery};
}
