import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {parseHTML} from 'linkedom';
const out=process.env.SITE_OUT_DIR||path.resolve(import.meta.dirname,'../../.build/site');

test('every directory shares navigation and marks its current destination in all languages',()=>{
 for(const prefix of ['','en/','ja/','zh-hant/'])for(const route of ['videos','creators','community-projects','friend-links','characters','topics','serials']){
  const {document}=parseHTML(fs.readFileSync(path.join(out,prefix+route+'.html'),'utf8'));
  const navigation=document.querySelector('aside.sidebar');
  assert.ok(navigation,prefix+route);
  const selected=[...navigation.querySelectorAll('a[aria-current="page"]')];
  assert.equal(selected.length,1,prefix+route);
  assert.equal(selected[0].getAttribute('href'),'/'+prefix+route+'.html');
  assert.equal(document.querySelectorAll('#language-options').length,1);
  assert.ok(document.querySelector('#collapse'));
 }
});
