import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {sidebarState,installSidebar} from '../public/components/sidebar-state.js';

function boot({mobile=false,saved='open',blocked=false}={}) {
 const {document,window}=parseHTML('<html><body><div id="app"><button data-drawer-close></button><aside id="site-sidebar"><button id="collapse"></button><a href="/community.html">Community</a></aside><div class="main"><button id="menu"></button></div></div></body></html>');
 const changes=[],media={matches:mobile,addEventListener:(_,fn)=>changes.push(fn)};
 const values=new Map([['bluedafeiyu-sidebar',saved]]);
 window.matchMedia=()=>media;
 Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:key=>{if(blocked)throw Error('blocked');return values.get(key);},setItem:(key,value)=>{if(blocked)throw Error('blocked');values.set(key,value);}}});
 const instance=installSidebar({document,window});
 const click=id=>document.getElementById(id).dispatchEvent(new window.Event('click',{bubbles:true}));
 return {document,window,media,values,instance,click,resize(value){media.matches=value;changes.forEach(fn=>fn());}};
}

test('desktop collapse persists while mobile drawer has independent state',()=>{
 const page=boot({saved:'collapsed'});
 assert.equal(page.instance.state.expanded,false);
 assert.equal(page.document.getElementById('site-sidebar').inert,false);
 page.resize(true);
 assert.equal(page.instance.state.open,false);
 assert.equal(page.document.getElementById('site-sidebar').inert,true);
 page.click('menu');
 assert.equal(page.instance.state.open,true);
 assert.equal(page.document.querySelector('.main').inert,true);
 assert.ok(page.document.body.classList.contains('sidebar-drawer-open'));
 page.click('collapse');
 assert.equal(page.instance.state.open,false);
 assert.equal(page.document.querySelector('.main').inert,false);
 assert.equal(page.values.get('bluedafeiyu-sidebar'),'collapsed');
 page.resize(false);
 assert.equal(page.instance.state.expanded,false);
 page.click('collapse');
 assert.equal(page.instance.state.expanded,true);
 assert.equal(page.values.get('bluedafeiyu-sidebar'),'open');
});

test('backdrop and Escape close the drawer and release content; breakpoint changes remove stale overlay state',()=>{
 const page=boot({mobile:true});
 page.click('menu');
 page.document.querySelector('[data-drawer-close]').dispatchEvent(new page.window.Event('click'));
 assert.equal(page.instance.state.open,false);
 page.click('menu');
 const escape=new page.window.Event('keydown',{bubbles:true,cancelable:true});
 escape.key='Escape';page.document.dispatchEvent(escape);
 assert.equal(page.instance.state.open,false);
 assert.equal(page.document.querySelector('.main').inert,false);
 page.click('menu');page.resize(false);
 assert.equal(page.instance.state.open,false);
 assert.equal(page.document.getElementById('site-sidebar').inert,false);
 assert.equal(page.document.body.classList.contains('sidebar-drawer-open'),false);
 assert.equal(page.document.getElementById('menu').getAttribute('aria-expanded'),'false');
});

test('blocked preferences and invalid values leave navigation usable',()=>{
 for(const saved of ['invalid','open',null])assert.equal(boot({saved}).instance.state.expanded,true);
 const page=boot({blocked:true});
 page.click('collapse');assert.equal(page.instance.state.expanded,false);
 page.resize(true);page.click('menu');assert.equal(page.instance.state.open,true);
 assert.deepEqual(sidebarState({mobile:false,collapsed:false,drawerOpen:true}),{open:false,sidebarInert:false,mainInert:false,expanded:true});
});
