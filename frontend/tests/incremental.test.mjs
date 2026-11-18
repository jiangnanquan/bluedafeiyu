import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {hash,makePlan,verifyPrevious,safeFile,readState,copyImmutableAsset,STATE_VERSION,filesIn,outputHashes} from '../scripts/incremental.mjs';
import {createPageModel} from '../src/components/library/page-model.mjs';
import {createWorkPages} from '../src/components/archive/WorkPages.mjs';

const inputs={code:'code',build:'build',content:'content',runtime:'runtime'};
test('transfer temporary files never enter artifact inventories or release hashes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bluefish-transfer-'));
 try {
  fs.mkdirSync(path.join(dir,'en/.rsync-tmp'),{recursive:true});
  fs.writeFileSync(path.join(dir,'en/.rsync-tmp/unfinished.html'),'incomplete transfer');
  fs.writeFileSync(path.join(dir,'en/about.html'),'published content');
  assert.deepEqual(filesIn(dir),['en/about.html']);
  assert.deepEqual(Object.keys(outputHashes(dir)),['en/about.html']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('immutable asset reuse never rewrites the prior release when a later image changes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bluefish-incremental-'));
 const originalEnv=process.env.SITE_REUSE_ASSETS;
 try {
  const source=path.join(dir,'source.jpg'),previous=path.join(dir,'previous.jpg'),target=path.join(dir,'next.jpg');
  fs.writeFileSync(source,'old image');fs.writeFileSync(previous,'old image');fs.chmodSync(previous,0o644);
  process.env.SITE_REUSE_ASSETS='1';copyImmutableAsset(source,target,previous);
  if(process.platform!=='win32')assert.equal(fs.statSync(target).ino,fs.statSync(previous).ino);
  fs.writeFileSync(source,'new image');copyImmutableAsset(source,target,previous);
  assert.equal(fs.readFileSync(previous,'utf8'),'old image');assert.equal(fs.readFileSync(target,'utf8'),'new image');
 }finally{
  if(originalEnv===undefined)delete process.env.SITE_REUSE_ASSETS;else process.env.SITE_REUSE_ASSETS=originalEnv;
  assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});
 }
});
test('gzip reuse verifies source bytes and regenerates corrupt compressed artifacts',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bluefish-incremental-'));
 try {
  const previous=path.join(dir,'previous'),next=path.join(dir,'next');fs.mkdirSync(previous);fs.mkdirSync(next);
  const raw='body{color:blue;margin:0}\n'.repeat(200);fs.writeFileSync(path.join(previous,'site.css'),raw);fs.writeFileSync(path.join(next,'site.css'),raw);
  fs.writeFileSync(path.join(previous,'site.css.gz'),'corrupted');fs.writeFileSync(path.join(next,'.build-state.json'),'x'.repeat(2000));
  const tool=path.resolve(import.meta.dirname,'../../tools/compress_static.mjs');
  const run=()=>spawnSync(process.execPath,[tool,'--dir',next,'--precompress'],{env:{...process.env,SITE_PREVIOUS_DIR:previous},encoding:'utf8'});
  const first=run();assert.equal(first.status,0,first.stderr);assert.equal(zlib.gunzipSync(fs.readFileSync(path.join(next,'site.css.gz'))).toString(),raw);
  assert.equal(fs.existsSync(path.join(next,'.build-state.json.gz')),false);
  const second=run();assert.equal(second.status,0,second.stderr);assert.match(second.stdout,/复用已验证的压缩产物：1/);
  assert.equal(fs.readFileSync(path.join(previous,'site.css.gz'),'utf8'),'corrupted');
 }finally{assert.equal(path.dirname(dir),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}
});
test('release gzip digests reuse verified bytes and reject changed or corrupt entries',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bluefish-gzip-'));
 try {
  const previous=path.join(dir,'previous'),next=path.join(dir,'next');
  fs.mkdirSync(previous);fs.mkdirSync(next);
  const old='body{color:blue}\n'.repeat(200),updated='body{color:red}\n'.repeat(200);
  const paths=['unchanged.css','changed.css','damaged.css'];
  for(const relative of paths){
   fs.writeFileSync(path.join(previous,relative),old);
   fs.writeFileSync(path.join(next,relative),relative==='changed.css'?updated:old);
  }
  const tool=path.resolve(import.meta.dirname,'../../tools/compress_static.mjs');
  const state={outputs:{'unchanged.css':hash(old)},pages:{},sitemap:{}};
  for(const root of [previous,next])fs.writeFileSync(path.join(root,'.build-state.json'),JSON.stringify(state));
  const run=(root,flags=[])=>spawnSync(process.execPath,[tool,'--dir',root,'--precompress',...flags],{encoding:'utf8'});
  const first=run(previous);assert.equal(first.status,0,first.stderr);
  fs.writeFileSync(path.join(previous,'damaged.css.gz'),'corrupted');
  const second=run(next,['--previous-dir',previous,'--previous-state',path.join(previous,'.build-state.json')]);
  assert.equal(second.status,0,second.stderr);
  assert.match(second.stdout,/摘要匹配 1、解压校验 0.*重新压缩 2/);
  const nextState=JSON.parse(fs.readFileSync(path.join(next,'.build-state.json'),'utf8'));
  assert.deepEqual(nextState.outputs,state.outputs);
  for(const relative of paths){
   const gz=fs.readFileSync(path.join(next,relative+'.gz'));
   assert.equal(zlib.gunzipSync(gz).toString(),relative==='changed.css'?updated:old);
   assert.equal(nextState.gzip.files[relative].gz,hash(gz));
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('plans cold starts, edits, additions, deletions and unchanged inputs',()=>{
 const previous={inputs,routes:{'/a.html':'a','/b.html':'b'}};
 assert.equal(makePlan(inputs,previous.routes,null,{ok:false,reason:'missing-baseline'}).mode,'full');
 const next=makePlan({...inputs,content:'changed'},{'/a.html':'edited','/c.html':'new'},previous,{ok:true});
 assert.equal(next.mode,'incremental');assert.deepEqual(next.changed,['/a.html','/c.html']);assert.deepEqual(next.removed,['/b.html']);
 assert.equal(makePlan(inputs,previous.routes,previous,{ok:true}).mode,'noop');
 assert.equal(makePlan({...inputs,code:'new'},previous.routes,previous,{ok:true}).mode,'incremental');
 assert.equal(makePlan({...inputs,build:'new'},previous.routes,previous,{ok:true}).mode,'full');
 assert.equal(makePlan({...inputs,runtime:'new'},previous.routes,previous,{ok:true}).mode,'full');
 assert.equal(makePlan({...inputs,code:'new'},previous.routes,previous,{ok:true}).changed.length,0);
 assert.equal(makePlan(inputs,previous.routes,previous,{ok:true},true).mode,'full');
});
test('missing or corrupted release artifacts invalidate reuse; artifact paths stay inside the output',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'bluefish-incremental-'));
 try {
  fs.writeFileSync(path.join(base,'index.html'),'original');
  const state={outputs:{'index.html':hash('original')}};
  assert.equal(verifyPrevious(base,state).ok,true);
  fs.writeFileSync(path.join(base,'index.html'),'corrupted');
  assert.match(verifyPrevious(base,state).reason,/changed/);
  fs.unlinkSync(path.join(base,'index.html'));assert.match(verifyPrevious(base,state).reason,/missing/);
  for(const value of ['../secret','a/../../secret','C:\\secret','/secret','a\\secret'])assert.throws(()=>safeFile(base,value));
  fs.writeFileSync(path.join(base,'state.json'),JSON.stringify({version:STATE_VERSION,inputs,routes:{},outputs:{'../secret':'x'}}));
  assert.equal(readState(path.join(base,'state.json')),null);
 } finally {
  assert.equal(path.dirname(base),path.resolve(os.tmpdir()));assert.ok(path.basename(base).startsWith('bluefish-incremental-'));
  fs.rmSync(base,{recursive:true,force:true});
 }
});
test('route fingerprint includes transformed output without rerendering a memoized body',()=>{
 let renders=0;
 const ctx={seo:{metadata:()=>({title:'a'}),enrich:(_url,value)=>value}};
 const model=createPageModel(ctx,'/works/a.html','a','browse',()=>{renders++;return 'body';});
 const original=model.cacheKey;
 model.transformContent(value=>value+' transformed');
 assert.notEqual(model.cacheKey,original);
 assert.equal(model.content,'body transformed');
 assert.equal(renders,1);
});
function keys(works,topics=[]) {
 const pages=new Map();
 const ctx={works,types:[],topics,tr:(_key,value)=>value,snapshot:{works},workHref:w=>'/works/'+w.slug+'.html',seo:{metadata:()=>({}),enrich:(_url,value)=>value},
  esc:value=>String(value??''),icon:()=>'',old:(_key,value)=>value,tagLink:tag=>tag,breadcrumbs:()=>'',sectionHead:()=>'',
  grid:related=>related.map(row=>`${row.slug}:${row.d}`).join(';')};
 ctx.write=(url,title,active,body,options)=>pages.set(url,createPageModel(ctx,url,title,active,body,options));
 createWorkPages(ctx);
 return Object.fromEntries([...pages].map(([url,p])=>[url,p.cacheKey]));
}
const work=(slug,tags=[])=>({id:slug,slug,cid:'one',cids:['one'],tg:tags,n:slug,d:'text',k:[],roles:[],rights:{}});
test('recommendation dependencies include new candidates, selected edits and removed works',()=>{
 const works=[work('target',['match']),...Array.from({length:10},(_,i)=>work('other-'+i))];
 const before=keys(works);
 const unrelated=structuredClone(works);unrelated.at(-1).d='not visible in the selected recommendations';
 assert.equal(keys(unrelated)['/works/target.html'],before['/works/target.html']);
 const entering=[...works,work('new',['match'])];
 assert.notEqual(keys(entering)['/works/target.html'],before['/works/target.html']);
 assert.notEqual(keys(works.filter(w=>w.slug!=='other-0'))['/works/target.html'],before['/works/target.html']);
 const edited=structuredClone(works);edited[1].d='visible card changed';
 assert.notEqual(keys(edited)['/works/target.html'],before['/works/target.html']);
 const topic={id:'chosen',list:[works[0],works[2]]};
 assert.notEqual(keys(works,[topic])['/works/target.html'],before['/works/target.html']);
});
