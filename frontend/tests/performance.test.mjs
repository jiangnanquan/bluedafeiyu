import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {parseHTML} from 'linkedom';
import {rankSubmissions} from '../public/archive/journal-ranking.js';
import {topicMembers} from '../public/archive/topic-zip.js';
import {packArchiveCatalog,unpackArchiveCatalog} from '../public/components/archive-catalog.js';
import {clientArchiveData} from '../src/lib/client-data.mjs';
import {selectDownloadHighlights} from '../public/components/home-downloads.js';

const root=path.resolve(import.meta.dirname,'../..');
const out=process.env.SITE_OUT_DIR||path.join(root,'.build/site');
const read=file=>JSON.parse(fs.readFileSync(path.join(out,file),'utf8'));
const publicData=read('archive-data.json');
const snapshot=JSON.parse(fs.readFileSync(path.join(root,'dist/site-data.json'),'utf8'));

test('localized catalogs retain search, preview and original download data for every work',()=>{
  for(const locale of ['zh','en','ja']){
    const wire=read(`archive-catalog/${locale}.json`);
    const data=unpackArchiveCatalog(wire);
    assert.deepEqual(data.works.map(work=>work.id),publicData.works.map(work=>work.id));
    assert.deepEqual(read(`archive-data/${locale}.json`).works.map(work=>work.id),data.works.map(work=>work.id),'cached clients retain the object catalog');
    for(const [i,work] of data.works.entries()){
      const original=publicData.works[i];
      for(const field of ['id','slug','n','d','cm','cids','roles','p','v','tg','o','l','f','s','bytes','lk','lt','ln','k','dt'])assert.deepEqual(work[field],original[field],`${locale} ${work.id} ${field}`);
      assert.deepEqual(Object.keys(work.i18n||{}),locale==='zh'?[]:[locale]);
      if(locale!=='zh')assert.deepEqual(work.i18n[locale],original.i18n[locale]);
    }
    for(const topic of data.topics)assert.deepEqual(topicMembers(data,topic.id).works.map(w=>w.id),topicMembers(publicData,topic.id).works.map(w=>w.id));
    // Bound the actual catalog transfer. Editorial text length can grow without
    // changing the number of works, so a fixed per-work average is misleading.
    const compressedBytes=zlib.gzipSync(Buffer.from(JSON.stringify(wire))).length;
    // The 1,990-work production catalogs are byte-identical to this release.
    // Keep a bounded transfer budget above that published content baseline.
    const transferBudget=locale==='zh'?640*1024:1280*1024;
    assert.ok(compressedBytes<=transferBudget,`${locale} catalog: ${compressedBytes} compressed bytes exceeds ${transferBudget}`);
  }
  assert.ok(publicData.works.every(w=>w.rights?.license),'Public rights metadata retained');
});

test('compact catalogs preserve interaction fields and download members, and accept older catalogs',()=>{
  for(const locale of ['zh','en','ja']){
    const projected=clientArchiveData(publicData,locale);
    assert.deepEqual(unpackArchiveCatalog(packArchiveCatalog(projected)),JSON.parse(JSON.stringify(projected)));
  }
  assert.equal(unpackArchiveCatalog(publicData),publicData);
  assert.throws(()=>unpackArchiveCatalog({schema:'archive-client/2',fields:['id','id'],works:[]}),/Invalid archive/);
  assert.throws(()=>unpackArchiveCatalog({schema:'archive-client/2',fields:['id'],works:[[]]}),/Invalid archive row/);
});

test('small homepage catalog gives identical real popularity results and localized card titles',()=>{
  const home=read('archive-home.json');
  const serialIds=new Set(publicData.topics.filter(topic=>topic.reader).flatMap(topic=>topic.workIds));
  const ids=snapshot.works.filter(w=>w.source==='submission'&&w.status==='published'&&!serialIds.has(w.id)).map(w=>w.id);
  assert.deepEqual(new Set(home.works.map(w=>w.id)),new Set(ids));
  const stats={available:true,works:Object.fromEntries(publicData.works.map((w,i)=>[w.id,{views:i%13,downloads:i%5}]))};
  assert.deepEqual(rankSubmissions(home.works,ids,stats).map(w=>w.id),rankSubmissions(publicData.works,ids,stats).map(w=>w.id));
  for(const work of home.works){
    const original=publicData.works.find(w=>w.id===work.id);
    assert.deepEqual(work.tg,original.tg,'Traditional Chinese card conversion retains its tag array');
    for(const locale of ['en','ja'])assert.equal(work.i18n[locale].name,original.i18n[locale].name);
  }
  assert.ok(zlib.gzipSync(Buffer.from(JSON.stringify(home))).length<110*home.works.length,'Compact catalog stays within 110 compressed bytes per submission');
});

test('one homepage gallery and its lazy thumbnails are rendered in all four languages',()=>{
  for(const prefix of ['','en/','ja/','zh-hant/']){
    const {document}=parseHTML(fs.readFileSync(path.join(out,prefix+'index.html'),'utf8'));
    const styles=[...document.querySelectorAll('link[rel=stylesheet]')];
    assert.equal(styles.length,1,prefix+' one stylesheet');
    assert.match(styles[0].getAttribute('href'),/^\/_astro\/.+\.css$/);
    const images=[...document.querySelectorAll('img')];
    assert.equal(images.filter(img=>img.getAttribute('fetchpriority')==='high').length,1);
    assert.equal(document.querySelectorAll('main .work-grid').length,1);
    const cards=document.querySelectorAll('.home-gallery .work-card img');
    assert.equal(cards.length,24);
    assert.equal([...cards].filter(img=>img.getAttribute('loading')==='eager').length,4);
    assert.equal([...cards].filter(img=>img.getAttribute('loading')==='lazy').length,20);
    assert.ok(document.querySelector('.home-gallery input[name="tag"]'));
    assert.ok(document.querySelector('.home-gallery button[data-catalog-type="meme"]'));
    assert.equal(document.querySelector('.home-gallery noscript a').getAttribute('href'),'/'+prefix+'page/2.html');
    assert.ok(document.querySelector('script[type=module][src^="/_astro/"]'));
    for(const name of ['archive-copy','archive-labels'])assert.equal(!!document.querySelector(`script[src^="/${name}.js"]`),['en/','ja/'].includes(prefix),prefix+' runtime dictionaries');
  }
});

test('the initial video document stays under 80 KB and all locales link to their next page',()=>{
  for(const prefix of ['','en/','ja/','zh-hant/']){
    const html=fs.readFileSync(path.join(out,prefix+'videos.html'),'utf8');
    assert.ok(Buffer.byteLength(html)<80_000);
    const {document}=parseHTML(html);
    assert.equal(document.querySelectorAll('main [data-video-bvid]').length,24);
    assert.ok(document.querySelectorAll('main *').length<400);
    assert.equal(document.querySelector('main a[rel="next"]').getAttribute('href'),'/'+prefix+'videos/page/2.html');
    assert.ok(fs.existsSync(path.join(out,prefix+'videos/page/2.html')));
    assert.ok(fs.existsSync(path.join(out,prefix+'videos/oldest.html')));
  }
});

test('home uses only the current UI dictionary and keeps a stable language trigger in static HTML',()=>{
  for(const prefix of ['','en/','ja/','zh-hant/']){
    const {document}=parseHTML(fs.readFileSync(path.join(out,prefix+'index.html'),'utf8'));
    assert.equal(document.querySelectorAll('#lang').length,1);
    assert.equal(document.querySelector('#lang').hasAttribute('hidden'),false);
    const dictionaries=[...document.querySelectorAll('script[src^="/lang/"]')].map(script=>script.getAttribute('src').split('?')[0]);
    assert.deepEqual(dictionaries,['en/','ja/'].includes(prefix)?['/lang/'+prefix.slice(0,-1)+'.js']:[]);
    const css=document.querySelector('link[rel="stylesheet"]').getAttribute('href').slice(1);
    assert.ok(fs.statSync(path.join(out,css)).size<106_000,'shared CSS stays at least 20% below the previous bundle');
    if(prefix==='en/'){
      assert.match(document.title,/^Blue Dafeiyu/);
      assert.doesNotMatch(document.title,/蓝色大肥鱼/);
      assert.equal(document.querySelector('meta[property="og:title"]').getAttribute('content'),document.title);
    }
  }
  assert.ok(fs.statSync(path.join(out,'lang.js')).size<25_000);
});

test('the published favicon and all staged gallery WebP previews meet their transfer budgets',()=>{
  assert.ok(fs.statSync(path.join(out,'favicon.png')).size<10_000);
  for(const dir of [path.join(out,'submissions/previews'),path.join(out,'owner-picks/previews'),path.join(root,'dist/data/blue-fish/previews')]){
    for(const file of fs.readdirSync(dir,{recursive:true}).filter(name=>name.endsWith('.webp'))){
      assert.ok(fs.statSync(path.join(dir,file)).size<100_000,file);
    }
  }
});

test('all four localized ZIP dialogs render real labels before the runtime opens them',()=>{
  for(const prefix of ['','en/','ja/','zh-hant/']){
    const {document}=parseHTML(fs.readFileSync(path.join(out,prefix+'topics.html'),'utf8'));
    const dialog=document.querySelector('#topic-download-dialog');
    assert.ok(dialog.querySelector('h2').textContent.trim());
    for(const selector of ['[data-topic-retry]','[data-topic-save]','[data-topic-close]']){
      const button=dialog.querySelector(selector);
      assert.ok(button.querySelector('span[data-i18n]'),selector);
      assert.doesNotMatch(button.textContent,/<\/?span/);
    }
  }
});

test('compact downloads catalog keeps eligible works, originals and translations without the full descriptions',()=>{
  const data=read('archive-downloads.json');
  const serialIds=new Set(publicData.topics.filter(topic=>topic.reader).flatMap(topic=>topic.workIds));
  const eligible=publicData.works.filter(work=>!serialIds.has(work.id));
  assert.deepEqual(data.works.map(work=>work.id),eligible.map(work=>work.id));
  const stats={available:true,works:Object.fromEntries(publicData.works.map((work,i)=>[work.id,{downloads:i%17}]))};
  assert.deepEqual(selectDownloadHighlights(data.works,stats).map(work=>work.id),selectDownloadHighlights(eligible,stats).map(work=>work.id));
  for(const [i,work] of data.works.entries()){
    const original=eligible[i];
    assert.equal(work.o,original.o);
    for(const locale of ['en','ja'])assert.equal(work.i18n[locale].name,original.i18n[locale].name);
  }
  assert.ok(zlib.gzipSync(Buffer.from(JSON.stringify(data))).length<180*data.works.length,'download ranking uses a compact lazy catalog');
});
