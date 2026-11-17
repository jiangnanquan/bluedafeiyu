import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {createWorkCards} from '../src/components/archive/WorkCards.mjs';
import {renderPagedFeed} from '../src/components/archive/PagedFeed.mjs';

const works=Array.from({length:55},(_,i)=>({id:'stable-'+i,slug:'frozen-'+i,n:'Work '+i,i:'/thumb.webp',w:320,h:400+i*3,k:['meme'],roles:[],tg:[],dt:'2026.11.17'}));
test('native column cards retain source order, stable links and dimensions without scripting geometry',()=>{
 const {document}=parseHTML(createWorkCards().grid(works));
 const grid=document.querySelector('.work-grid.masonry');
 assert.deepEqual([...grid.children].map(node=>node.dataset.slug),works.map(work=>work.slug));
 assert.equal(document.querySelector('script,[style]'),null);
 for(const [i,card] of [...grid.children].entries()) {
  assert.equal(card.querySelector('.work-title').getAttribute('href'),'/works/'+works[i].slug+'.html');
  assert.equal(Number(card.querySelector('img').getAttribute('height')),works[i].h);
 }
});
test('paged image feeds preserve deferred and no-script items in native columns',()=>{
 const cards=works.map(work=>createWorkCards().card(work));
 const {document}=parseHTML(renderPagedFeed(cards,{kind:'images',gridClass:'work-grid'}));
 assert.ok(document.querySelector('[data-feed-grid].masonry'));
 const rest=parseHTML(document.querySelector('template').innerHTML).document;
 assert.equal(document.querySelectorAll('[data-feed-grid] .work-card').length+rest.querySelectorAll('.work-card').length,works.length);
 assert.equal(document.querySelector('script,[style]'),null);
 assert.ok(document.querySelector('noscript .masonry'));
});
