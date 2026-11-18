import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {installSubmissionTabs} from '../public/components/submission-tabs.js';

const turnstileScript=fs.readFileSync(new URL('../public/page-scripts/turnstile-widget.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

function widgetFixture(turnstile) {
  const markup='<section><div data-verification hidden><div data-slot></div><p data-error hidden></p></div></section>';
  const {document,window}=parseHTML('<html data-theme="dark"><head></head><body>'+markup+markup+'</body></html>');
  const scope={turnstile};
  vm.runInNewContext(turnstileScript,{document,window:scope,setTimeout,clearTimeout});
  const tokens=['',''];
  const rows=[...document.querySelectorAll('[data-verification]')];
  const forms=rows.map((row,index)=>scope.SiteTurnstile.install({
    sitekey:'test',row,slot:row.querySelector('[data-slot]'),status:row.querySelector('[data-error]'),
    onToken:value=>{tokens[index]=value;}
  }));
  return {document,window,forms,rows,tokens};
}

test('both verification rows expose a script load failure from the one shared request',async()=>{
  const {document,forms,rows,tokens}=widgetFixture();
  const scripts=document.head.querySelectorAll('script');
  assert.equal(scripts.length,1);
  scripts[0].onerror();
  await settle();
  for(const [i,form] of forms.entries()){
    assert.equal(form.failed,true);
    assert.equal(rows[i].hidden,false);
    const status=rows[i].querySelector('[data-error]');
    assert.equal(status.hidden,false);
    assert.match(status.textContent,/人机验证加载失败/);
    assert.equal(tokens[i],'');
  }
});

test('verification follows the current theme, clears stale tokens and preserves reset behavior',async()=>{
  const renders=[],removed=[],reset=[];
  const mock={
    render(_slot,config){renders.push(config);return renders.length;},
    remove(id){removed.push(id);},
    reset(id){reset.push(id);}
  };
  const {document,window,forms,tokens}=widgetFixture(mock);
  await settle();
  assert.deepEqual(renders.map(config=>config.theme),['dark','dark']);
  renders[0].callback('first-verification');
  document.documentElement.dataset.theme='light';
  document.dispatchEvent(new window.CustomEvent('site:themechange',{detail:{theme:'light'}}));
  await settle();
  assert.deepEqual(removed,[1,2]);
  assert.deepEqual(tokens,['','']);
  assert.deepEqual(renders.slice(2).map(config=>config.theme),['light','light']);
  renders[0].callback('late-verification');
  assert.equal(tokens[0],'');
  renders[2].callback('current-verification');
  assert.equal(tokens[0],'current-verification');
  forms[0].reset();
  assert.deepEqual(reset,[3]);
  assert.equal(tokens[0],'');
});

function fixture(mode='image',query='') {
  const {document,window}=parseHTML(`<html><body data-submission-mode="${mode}"><div role="tablist"><button role="tab" data-submission-mode="image"></button><button role="tab" data-submission-mode="video"></button></div><section id="image-submission-panel"><input></section><section id="creator-registration"><input></section></body></html>`);
  Object.defineProperty(window,'location',{value:new URL('https://example.test/submit.html'+query),configurable:true});
  installSubmissionTabs({document,window});
  const tabs=[...document.querySelectorAll('[role="tab"]')];
  const click=node=>node.dispatchEvent(new window.Event('click',{bubbles:true}));
  const state=()=>[...document.querySelectorAll('section')].map(node=>node.hidden);
  return {document,window,tabs,click,state};
}

test('image and video entry points can switch both ways despite bubbling to the page mode',()=>{
  for(const mode of ['image','video']){
    const f=fixture(mode);assert.deepEqual(f.state(),mode==='image'?[false,true]:[true,false]);
    f.click(f.tabs[1]);assert.deepEqual(f.state(),[true,false]);
    f.click(f.document.querySelector('#creator-registration input'));assert.deepEqual(f.state(),[true,false]);
    assert.equal(f.tabs[1].getAttribute('aria-selected'),'true');
    f.click(f.tabs[0]);assert.deepEqual(f.state(),[false,true]);
    assert.equal(f.document.body.hasAttribute('aria-selected'),false);
  }
});

test('existing query and anchor video links remain usable and keyboard selection updates state',()=>{
  for(const query of ['?media=video','#creator-registration']){
    const f=fixture('image',query);assert.deepEqual(f.state(),[true,false]);
    const key=new f.window.Event('keydown',{bubbles:true,cancelable:true});key.key='ArrowLeft';f.tabs[1].dispatchEvent(key);
    assert.equal(key.defaultPrevented,true);assert.deepEqual(f.state(),[false,true]);
    assert.equal(f.tabs[0].getAttribute('tabindex'),'0');assert.equal(f.tabs[1].getAttribute('tabindex'),'-1');
  }
});

test('switching forms updates one heading using copy already baked for the page language',()=>{
 const {document,window}=parseHTML('<html><body><div data-submission-heading data-image-title="Image submission" data-image-lead="An image or ZIP" data-video-title="Video registration" data-video-lead="Your public profile"><header><div class="eyebrow"><span>SUBMIT</span></div><h1>Image submission</h1><p class="lede">An image or ZIP</p></header></div><button role="tab" data-submission-mode="image"></button><button role="tab" data-submission-mode="video"></button><section id="image-submission-panel"></section><section id="creator-registration"></section></body></html>');
 Object.defineProperty(window,'location',{value:new URL('https://example.test/submit.html'),configurable:true});
 installSubmissionTabs({document,window});
 document.querySelector('[data-submission-mode="video"]').dispatchEvent(new window.Event('click'));
 assert.equal(document.querySelectorAll('h1').length,1);assert.equal(document.querySelector('h1').textContent,'Video registration');
 assert.equal(document.querySelector('h1').getAttribute('data-i18n'),'d.submission.videoTitle');
 assert.equal(document.querySelector('.lede').textContent,'Your public profile');
 document.querySelector('[data-submission-mode="image"]').dispatchEvent(new window.Event('click'));
 assert.equal(document.querySelector('h1').textContent,'Image submission');
});
