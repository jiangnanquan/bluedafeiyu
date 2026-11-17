import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {parseHTML} from 'linkedom';
import {renderWorkCard} from '../public/components/work-card.js';
import {renderHomeCard} from '../src/components/home/HomeCard.mjs';
import {checkComponents} from '../scripts/check-components.mjs';
const frontend=path.resolve(import.meta.dirname,'..');
const read=relative=>fs.readFileSync(path.join(frontend,relative),'utf8');
test('one public layout owns every document and obsolete cascades cannot return',async()=>{
 assert.deepEqual(await checkComponents(),[]);
 const catalog=JSON.parse(read('component-library.json'));
 assert.equal(catalog.siteShell.document,'src/layouts/Archive.astro');
 for(const name of catalog.retiredStyleAssets)assert.equal(fs.existsSync(path.join(frontend,name)),false,name);
 const entry=read(catalog.siteShell.styles);
 assert.doesNotMatch(entry,/Notebook|ArchiveTheme|ArchivePrimitives|original-|demo-|journal-|public\/tokens/);
 for(const file of ['src/components/home/HomePage.astro','src/components/archive/DirectoryPage.astro','src/components/characters/CharacterIndexPage.astro','src/components/collections/CollectionIndexPage.astro'])assert.doesNotMatch(read(file),/<html|<!doctype|id="app"/i);
});
test('home and appended work cards share stable preview, source, identity and image dimensions',()=>{
 const work={id:'stable',slug:'frozen',n:'Name',d:'Description',i:'/thumb.webp',o:'/original.gif',w:320,h:480,k:['meme'],roles:[{id:'deepseek',name:'DeepSeek'}],tg:[],dt:'2026.11.17'};
 assert.equal(renderHomeCard(work),renderWorkCard(work));
 const {document}=parseHTML(renderWorkCard(work,{url:href=>'/en'+href}));
 assert.equal(document.querySelector('article').dataset.slug,'frozen');
 assert.equal(document.querySelector('img').getAttribute('width'),'320');
 assert.equal(document.querySelector('img').getAttribute('height'),'480');
 for(const link of document.querySelectorAll('a[data-preview]'))assert.equal(link.href,'/en/works/frozen.html');
 assert.equal(document.querySelector('[style]'),null);
});
test('the current-page language switch and existing saved state remain production contracts',()=>{
 assert.match(read('public/components/home-controls.js'),/location\.pathname\.replace/);
 assert.match(read('public/components/home-controls.js'),/location\.search\+location\.hash/);
 assert.match(read('public/archive/saved-items.js'),/bluefish-demo:/);
 assert.doesNotMatch(read('src/components/pages/SubmitPage.astro'),/Demo|模拟/);
 assert.match(read('public/page-scripts/submit-0.js'),/api\/v1\/submissions/);
 assert.match(read('public/page-scripts/creator-registration.js'),/api\/v1\/creators/);
});
