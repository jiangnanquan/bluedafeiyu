import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {installSubmissionTabs} from '../public/components/submission-tabs.js';

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
