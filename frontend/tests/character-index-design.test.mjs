import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {parseHTML} from 'linkedom';
const root=path.resolve(import.meta.dirname,'../..');
const out=process.env.SITE_OUT_DIR||path.join(root,'.build/site');
const data=JSON.parse(fs.readFileSync(path.join(out,'archive-data.json'),'utf8'));
const serialIds=new Set(data.topics.filter(topic=>topic.reader).flatMap(topic=>topic.workIds));
const expected=data.characters.map(c=>({...c,count:data.works.filter(w=>w.cids.includes(c.id)&&!serialIds.has(w.id)).length}));
for(const prefix of ['','zh-hant/','en/','ja/'])test('shared character cards preserve real routes and ordinary-work counts: '+(prefix||'zh'),()=>{
 const {document}=parseHTML(fs.readFileSync(path.join(out,prefix+'characters.html'),'utf8'));
 const cards=[...document.querySelectorAll('article.role-card')];
 assert.equal(cards.length,expected.length);assert.equal(document.querySelectorAll('h1').length,1);
 for(const [i,card] of cards.entries()){
  assert.equal(card.querySelector('.role-art').getAttribute('href'),'/'+prefix+'characters/'+expected[i].id+'.html');
  assert.equal(Number(card.querySelector('.role-count').textContent.trim().match(/^\d+/)[0]),expected[i].count);
  const img=card.querySelector('img');assert.ok(img.getAttribute('alt'));
  const src=img.getAttribute('src');assert.ok(fs.existsSync(path.join(src.startsWith('/data/blue-fish/')?path.join(root,'dist'):out,src)));
 }
 assert.equal(document.querySelector('.sidebar [aria-current=page]').getAttribute('href'),'/'+prefix+'characters.html');
 assert.equal(document.querySelectorAll('#language-options [role=option]').length,4);
 const brand=document.querySelector('.brand-mark');
 assert.equal(brand.getAttribute('href'),'/'+prefix);
 assert.ok(brand.getAttribute('aria-label'));
 assert.ok(brand.querySelector('img[src="/avatar.png"][alt=""]'));
});
