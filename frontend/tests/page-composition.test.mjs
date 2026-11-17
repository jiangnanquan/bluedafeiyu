import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {parseHTML} from 'linkedom';
const root=path.resolve(import.meta.dirname,'../..');
const out=process.env.SITE_OUT_DIR||path.join(root,'.build/site');
const doc=relative=>parseHTML(fs.readFileSync(path.join(out,relative),'utf8')).document;
test('all public page families have one shared shell and one instance of each dialog',()=>{
 for(const relative of ['index.html','browse.html','characters.html','characters/deepseek.html','topics.html','serials.html','videos.html','creators.html','community-projects.html','friend-links.html','community.html','events/current.html','about.html','submit.html','submit-video.html','saved.html','search.html','404.html']){
  const document=doc(relative);
  for(const selector of ['#app','aside.sidebar','header.topbar','main#main','footer.site-footer','#preview-dialog','#share-card-dialog','#topic-download-dialog'])assert.equal(document.querySelectorAll(selector).length,1,relative+' '+selector);
  assert.equal(document.querySelector('body').getAttribute('data-design-version'),'20261117-unified');
  assert.equal(document.querySelectorAll('main h1').length,1,relative+' h1');
 }
});
test('homepage sections contain distinct real works and the ordinary collection index excludes serials',()=>{
 const home=doc('index.html');
 const slugs=[...home.querySelectorAll('.home-section .work-card')].map(card=>card.dataset.slug);
 assert.equal(slugs.length,36);assert.equal(new Set(slugs).size,slugs.length);
 assert.equal(home.querySelectorAll('.guide-card details.faq summary').length,2,'one FAQ component');
 const topics=doc('topics.html');
 assert.equal(topics.querySelectorAll('.coll-row').length,6);
 assert.equal(topics.querySelector('main a[data-collection-id="eden-sins-bloom"]'),null);
});
