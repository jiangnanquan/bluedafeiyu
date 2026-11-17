import {renderPagedFeed} from './PagedFeed.mjs';
import {guideLinks} from './GuidePages.mjs';
import {createComicSeries} from './ComicSeries.mjs';
import {createComicArchive} from './ComicArchive.mjs';
import {renderShareButton} from '../../../public/components/share-card-model.js';
export function createCollectionPages(ctx) {
  const {topics,esc,tr,old,icon,button,card,grid,sectionHead,collectionCard,breadcrumbs,pageHead,write}=ctx;
  createComicArchive(ctx);
  const normalTopics=topics.filter(topic=>!topic.reader);
  write('/topics.html','合集','topics',`${pageHead('CURATED TOPICS',tr('topicsTitle','主题合集','Collections','テーマ別コレクション'),tr('topicsLead','按作者、连载与日常主题把相关作品串在一起，支持浏览预览与打包下载原图。','Explore connected works by creator, comic series and everyday themes. Preview works or download the originals together.','作者、連載、日常のテーマで作品をまとめています。プレビューや元画像の一括保存に対応しています。'))}${sectionHead(tr('publishedTopics','全部主题与作者合集','All themes and creator collections','テーマと作者のコレクション'),String(normalTopics.length))}<div class="coll-list">${normalTopics.map(collectionCard).join('')}</div>${sectionHead(tr('guide.label','专题导览','Fan art guides','ファンアートガイド'),tr('guide.start','从角色别名与热门类型开始找图','Start with character aliases and popular types','キャラクターの愛称と人気の種類から探す'))}${guideLinks(ctx)}`);
  for(const topic of topics) {
    if(topic.reader){createComicSeries(ctx,topic);continue;}
    const creator=topic.author;
    const uid=creator?.channels?.map(c=>c.url.match(/space\.bilibili\.com\/(\d+)/)?.[1]).find(Boolean);
    const creatorHref=creator?'/creators/'+(uid?'bilibili-'+uid:topic.id)+'.html':'';
    const count=`${topic.list.length} ${old('v2.work','作品')}`;
    const authorSource=creator?`<p class="source-note" data-topic-author>${tr('topicSourceCreator','来源作者','Source creator','出典の作者')} <a class="author-name" href="${esc(creator.channels?.[0]?.url||creator.url)}" target="_blank" rel="noopener noreferrer">${esc(creator.name)}</a></p>`:'';
    const actions=`<div class="topic-actions"><button class="button primary" type="button" data-download-topic="${esc(topic.id)}">${icon('download',16)}${tr('zipDownload','打包下载原图','Download originals ZIP','元画像をZIPでダウンロード')} (${topic.list.length})</button>${creatorHref?button(creatorHref,tr('creatorArchiveLink','查看创作者档案','View creator profile','作者のプロフィール')):''}${renderShareButton('/topics/'+topic.id+'.html')}</div>`;
    write('/topics/'+topic.id+'.html',topic.name,'topics',`${breadcrumbs([[old('v2.nav.collections','合集'),'/topics.html'],[esc(topic.name)]])}${pageHead(creator?'AUTHOR COLLECTION':'CURATED TOPIC',esc(topic.name),esc(topic.summary)+' · '+count,actions)}${authorSource}
      <section id="collection-works">${sectionHead(tr('collectionWorks','合集作品','Works in this collection','コレクションの作品'),tr('curatedOrderNote','按人工编排顺序浏览','In curated order','編集された順番で表示'))}${renderPagedFeed(topic.list.map(card),{kind:'topic',gridClass:'work-grid',label:tr('loadMore','再看一些','Load more','もっと見る')})}</section>
      <section id="more-collections">${sectionHead(tr('otherCollections','其他合集','Other collections','ほかのコレクション'),tr('anotherTheme','换个主题继续逛','Try another theme','ほかのテーマも見る'))}<div class="topic-mini-grid">${topics.filter(other=>other.id!==topic.id).slice(0,4).map(other=>collectionCard(other,{compact:true,download:false})).join('')}</div></section>`,{attrs:'data-curated-topic'});
  }
}
