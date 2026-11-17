import {guides,guidePath} from '../../lib/landing-copy.mjs';

// These guides link to existing records; topic membership stays owner-curated.
export function guideLinks(ctx) {
  const {tr}=ctx;
  return `<div class="guide-links">${guides.map(guide=>`<a class="guide-link" href="${guidePath(guide)}"><b>${tr('guide.'+guide.id+'.name',...guide.name)}</b><span>${tr('guide.'+guide.id+'.summary',...guide.summary)}</span></a>`).join('')}</div>`;
}

export function createGuidePages(ctx) {
  const {chars,types,esc,tr,button,grid,breadcrumbs,pageHead,sectionHead,write}=ctx;
  for(const guide of guides) {
    if(ctx.topics.some(topic=>topic.id===guide.id))throw new Error('Topic ID is reserved for an editorial guide: '+guide.id);
    const character=chars.find(c=>c.id===guide.character);
    if(!character)throw new Error('Guide character does not exist: '+guide.character);
    const list=character.list.filter(w=>!guide.type||w.k.includes(guide.type));
    const destination='/characters/'+guide.character+(guide.type?'/'+guide.type:'')+'.html';
    const typeCards=types.filter(type=>character.list.some(w=>w.k.includes(type.id))).map(type=>`<a class="type-entry" href="/characters/${character.id}/${type.id}.html"><b>${tr('guide.type.'+type.id,type.name,{meme:'Memes',illustration:'Illustrations',setting:'Character designs',comic:'Comics',standing:'Character portraits',other:'Other works'}[type.id],{meme:'ネタ画像',illustration:'イラスト',setting:'設定画',comic:'漫画',standing:'立ち絵',other:'その他'}[type.id])}</b><span>${character.list.filter(w=>w.k.includes(type.id)).length}</span></a>`).join('');
    write(guidePath(guide),guide.name[0],'topics',`${breadcrumbs([[tr('guide.label','专题导览','Fan art guides','ファンアートガイド'),'/topics.html'],[tr('guide.'+guide.id+'.name',...guide.name)]])}${pageHead('TOPIC GUIDE',tr('guide.'+guide.id+'.name',...guide.name),tr('guide.'+guide.id+'.summary',...guide.summary))}
      <div class="guide-card2"><h2>${tr('guide.explore','快速导览入口','Quick links','すぐに探す')}</h2><p>${tr('guide.permissionsText','每张作品均保留来源、署名与使用许可说明。打开预览或详情页即可下载原图，并核对允许的使用范围。','Each work retains its source, credits and permission notes. Open its preview or details to download the original and check how it may be used.','各作品に出典、クレジット、利用許諾を掲載しています。プレビューや詳細で元画像を保存し、利用可能な範囲をご確認ください。')}</p><div class="guide-acts">${button(destination,tr('guide.browse','浏览全部相关作品','Browse all related works','関連作品をすべて見る'),'primary')}${button('/about.html#license',tr('guide.rights','来源与授权','Sources & permissions','出典と利用許諾'))}</div></div>
      ${sectionHead(tr('guide.types','按类型找图','Browse by type','種類から探す'))}<div class="type-grid">${typeCards}</div>
      ${sectionHead(tr('guide.recent','精选推荐作品','Selected works','おすすめの作品'),String(list.length))}${grid(list.slice(0,12))}`,{attrs:'data-editorial-guide="'+esc(guide.id)+'"'});
  }
}
