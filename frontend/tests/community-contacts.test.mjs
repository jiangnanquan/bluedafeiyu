import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createPrimitives} from '../src/components/archive/primitives.mjs';
import path from 'node:path';
process.env.SITE_SOURCE=path.resolve(import.meta.dirname,'../..');
const {createCommunityPage}=await import('../src/components/archive/CommunityPage.mjs');
const {COMMUNITY_CONTACT_COPY}=await import('../src/components/library/CommunityContacts.mjs');
import {aboutQuestions} from '../src/lib/about-copy.mjs';

test('public community uses invitation links and QR codes without group numbers, search instructions or copy buttons',()=>{
 let html='';
 const ctx=createPrimitives({translations:{en:{},ja:{}},modelVendors:{}});
 createCommunityPage({...ctx,write:(_url,_title,_active,content)=>{html=content;}});
 const {document}=parseHTML(html);
 const qq=document.querySelector('[data-community-channel="qq"]');
 assert.equal(qq.querySelectorAll('a').length,2);
 for(const a of qq.querySelectorAll('a'))assert.equal(a.getAttribute('href'),'https://qm.qq.com/q/pLsmlo1J0Q');
 assert.equal(qq.querySelector('button,[data-copy]'),null);
 assert.match(qq.querySelector('img').getAttribute('src'),/^\/community\/qq-join-[a-f0-9]+\.png$/);
 assert.doesNotMatch(html+JSON.stringify(COMMUNITY_CONTACT_COPY)+JSON.stringify(aboutQuestions),/1134100615|1003728058|复制群号|search for it in QQ|グループ番号/);
 assert.equal(document.querySelector('[data-community-channel="discord"] a').getAttribute('href'),'https://discord.gg/pmECYDChY');
 assert.ok(document.querySelector('[data-community-channel="wechat"] img'));
});
