#!/usr/bin/env node
// Build an isolated release; only validated output replaces the requested directory.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareLocalization,languageSitemap,localizedPath,LOCALES,ORIGIN,sitemapWorkImage} from './localize-pages.mjs';
import {readSitemapHistory,updateSitemapHistory} from './sitemap-history.mjs';
import {writeAiContent} from './ai-content.mjs';
import {writeOpenApi} from './open-api.mjs';
import {STATE_VERSION,STATE_FILE,readState,hash,outputHashes,copyArtifact,copyImmutableAsset,filesIn} from './incremental.mjs';
import {auditLanguagePages} from '../../tools/localization/audit-pages.mjs';

const started=performance.now();
let phaseStart=started;
const timings=JSON.parse(process.env.SITE_PREPARATION_TIMINGS || '{}');
const endPhase=name=>{
 const now=performance.now();
 timings[name]=Number(((now-phaseStart)/1000).toFixed(2));
 console.log(`[build-phase] ${name} ${timings[name]}s`);
 phaseStart=now;
};
const frontend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(frontend,'..'),dist=process.env.SITE_SNAPSHOT?path.dirname(path.resolve(process.env.SITE_SNAPSHOT)):path.join(root,'dist');
const buildTime=process.env.SOURCE_DATE_EPOCH?new Date(Number(process.env.SOURCE_DATE_EPOCH)*1000):new Date();
let requestedOut,forceClean=false,full=false,planOnly=false,requestedPrevious;
const args=process.argv.slice(2);
for(let i=0;i<args.length;i++) {
 const arg=args[i];
 if(arg==='--out') requestedOut=args[++i];
 else if(arg.startsWith('--out=')) requestedOut=arg.slice(6);
 else if(arg==='--previous') requestedPrevious=args[++i];
 else if(arg==='--force-clean') forceClean=true;
 else if(arg==='--full') full=true;
 else if(arg==='--plan-only') planOnly=true;
 else throw Error('Unknown build argument '+arg);
 if(['--out','--previous'].includes(arg) && (!args[i] || args[i].startsWith('--'))) throw Error(arg+' requires a path');
}
const out=path.resolve(root,requestedOut||'.build/site');
const astroOut=path.join(frontend,'out');
const rel=path.relative(root,out);
if([root,dist,frontend,astroOut,path.parse(out).root].includes(out)||out.split(path.sep).filter(Boolean).length<3)throw Error('Unsafe output path: '+out);
if(rel && !rel.startsWith('..') && !path.isAbsolute(rel) && rel.split(path.sep)[0]!=='.build')throw Error('Output inside repository must be under .build: '+out);
if(fs.existsSync(out) && (fs.lstatSync(out).isSymbolicLink() || (!forceClean && !fs.existsSync(path.join(out,'.build-output')))))throw Error('Existing output is not a marked build result: '+out);
const previousPath=path.resolve(root,requestedPrevious||process.env.SITE_PREVIOUS_DIR||out);
let previous=fs.existsSync(previousPath)?fs.realpathSync(previousPath):previousPath;
const publishedPrevious=previous;
const previousStateFile=process.env.SITE_PREVIOUS_STATE||path.join(previous,STATE_FILE);
let previousState=readState(previousStateFile);
const run=(script,argv=[],cwd=root,env={})=>{
 const result=spawnSync(process.execPath,[script,...argv],{cwd,env:{...process.env,...env},stdio:'inherit'});
 if(result.error||result.status!==0)throw Error(script+' failed: '+(result.error?.message||result.status));
};
const astro=path.join(frontend,'node_modules/astro/bin/astro.mjs');
if(!fs.existsSync(astro))throw Error('Astro is not installed: run npm ci in frontend/');
fs.mkdirSync(path.join(root,'.build'),{recursive:true});
const planFile=path.join(root,'.build','build-plan-'+process.pid+'.json');
const ogJobsFile=path.join(frontend,'.astro/og-jobs.jsonl');
fs.mkdirSync(path.dirname(ogJobsFile),{recursive:true});fs.writeFileSync(ogJobsFile,'');
process.env.OG_JOBS_FILE=ogJobsFile;
const candidate=!planOnly && process.env.PUBLISH_PREBUILT_DIR ? path.resolve(process.env.PUBLISH_PREBUILT_DIR) : '';
const previousSitemapFile=path.join(publishedPrevious,'sitemap.xml');
const baselineSitemap=fs.existsSync(previousSitemapFile) ? hash(fs.readFileSync(previousSitemapFile)) : null;
run(path.join(frontend,'scripts/plan-build.mjs'),[root,previous,previousStateFile,planFile,String(full),candidate,baselineSitemap||''],frontend);
let plan=JSON.parse(fs.readFileSync(planFile,'utf8'));
const preflight=plan.preflight;
if(preflight){
 previous=fs.realpathSync(candidate);
 previousState=readState(path.join(previous,STATE_FILE));
}
fs.copyFileSync(planFile,path.join(root,'.build/build-plan.json'));
endPhase('plan');
if(planOnly){fs.rmSync(planFile,{force:true});console.log('[build-plan] analysis complete; no pages rendered');process.exit(0);}
fs.mkdirSync(path.dirname(out),{recursive:true});
const stage=fs.mkdtempSync(path.join(path.dirname(out),'.build-pending-'));
let completed=false;
try {
 const reusableState=plan.mode==='full' ? null : previousState;
 const knownOutputs=new Map();
 const reuseArtifact=name=>{
  copyArtifact(previous,stage,name);
  knownOutputs.set(name,reusableState.outputs[name]);
 };
 let history=reusableState?.sitemap||{},pages=reusableState?.pages||{},audit=reusableState?.audit;
 let localeInputHash=reusableState?.localeInputHash;
 let ai={},openApi={},localized=0,reusedLanguagePages=0,reusedAssets=0;
 if(plan.mode==='noop') {
  for(const [name,digest] of Object.entries(reusableState.outputs)) {
    const source=path.join(previous,name),target=path.join(stage,name);
    let handedOff=false;
    if(preflight && process.env.SITE_HANDOFF_PREBUILT==='1' && fs.lstatSync(source).isFile()) {
     fs.mkdirSync(path.dirname(target),{recursive:true});
     try { fs.linkSync(source,target); handedOff=true; }
     catch(error) { if(error.code!=='EXDEV' && error.code!=='EPERM' && error.code!=='ENOTSUP')throw error; }
    }
    if(!handedOff && copyImmutableAsset(source,target,path.join(publishedPrevious,name),previous===publishedPrevious ? digest : undefined))reusedAssets++;
    knownOutputs.set(name,digest);
  }
  plan.rendered=[];
  reusedLanguagePages=Object.keys(pages).length*LOCALES.length;
  endPhase('reuse');
 } else {
  run(path.join(frontend,'scripts/prepare-language-assets.mjs'));
  // Astro can restore cached pages directly into the fresh release directory.
  run(astro,['build',...(plan.mode==='full'?['--force']:[])],frontend,{SITE_BUILD_PLAN_FILE:planFile,ASTRO_OUT_DIR:stage});
  plan=JSON.parse(fs.readFileSync(planFile,'utf8'));
  endPhase('astro');
  // Astro can restore a cached removed page before pruning its cache. The
  // current route plan, plus explicitly public HTML files, defines the release.
  const bases=filesIn(stage).filter(name=>name.endsWith('.html')).filter(file=>{
   if(Object.hasOwn(plan.routes,'/'+file)||fs.existsSync(path.join(frontend,'public',file)))return true;
   fs.rmSync(path.join(stage,file));
   return false;
  });
  const copy=(relative)=>{
   const source=path.join(dist,relative);
   if(!fs.existsSync(source))throw Error('Missing staged asset '+relative);
   const names=fs.statSync(source).isDirectory()?filesIn(source).map(name=>relative+'/'+name):[relative];
   fs.mkdirSync(path.join(stage,fs.statSync(source).isDirectory()?relative:path.dirname(relative)),{recursive:true});
   for(const name of names){
    const digest=reusableState?.outputs[name];
    if(copyImmutableAsset(path.join(dist,name),path.join(stage,name),path.join(previous,name),digest)){
     if(digest)knownOutputs.set(name,digest);
     reusedAssets++;
    }
   }
  };
  for(const file of ['avatar.png','favicon.ico','credits/shuangshuang.jpg','events/national-day-2026.webp','characters.json','categories.json','blue-fish-ids.json','topics.json','site-data.json','site-data.js','submissions/works.json','owner-picks/works.json'])copy(file);
  for(const dir of ['submissions/previews','submissions/large','owner-picks/previews','author-avatars','character-portraits','community'])copy(dir);
  const icons=spawnSync(process.env.PYTHON||'python3',[path.join(root,'tools/prepare_apple_touch_icons.py'),path.join(dist,'favicon.png'),stage],{stdio:'inherit'});
  if(icons.error||icons.status!==0)throw Error('Apple touch icon generation failed: '+(icons.error?.message||icons.status));
  if(process.env.SKIP_OG!=='1') {
   const jobs=[...new Map(fs.readFileSync(ogJobsFile,'utf8').split('\n').filter(Boolean).map(line=>JSON.parse(line)).map(job=>[job.id,job])).values()];
   const cache=path.join(root,'.build/og-cache');fs.mkdirSync(cache,{recursive:true});
   const jobsJson=path.join(cache,'jobs.json');fs.writeFileSync(jobsJson,JSON.stringify(jobs));
   const result=spawnSync(process.env.PYTHON||'python3',[path.join(root,'tools/og_cards.py'),jobsJson,cache,dist,path.join(dist,'avatar.png')],{cwd:root,stdio:'inherit'});
   if(result.error||result.status!==0)throw Error('Share card generation failed: '+(result.error?.message||result.status));
   fs.mkdirSync(path.join(stage,'og'),{recursive:true});
   for(const job of jobs){
    const name='og/'+job.id+'.jpg',digest=reusableState?.outputs[name];
    if(copyImmutableAsset(path.join(cache,job.id+'.jpg'),path.join(stage,name),path.join(previous,name),digest)){
     if(digest)knownOutputs.set(name,digest);
     reusedAssets++;
    }
   }
   console.log('[og] '+jobs.length+' share cards');
  }
  endPhase('assets');
  const snapshot=JSON.parse(fs.readFileSync(path.join(dist,'site-data.json'),'utf8'));
  const localizer=prepareLocalization(stage,snapshot);
  const canReuseLocale=reusableState?.inputs.localization===plan.inputs.localization;
  localeInputHash=hash([
   plan.inputs.content,
   ...['archive-copy.js','archive-labels.js'].map(file=>hash(fs.readFileSync(path.join(stage,file)))),
  ]);
  const sameLocaleInputs=localeInputHash===reusableState?.localeInputHash;
  const reusable=new Set();
  const urls=[];
  pages={};
  for(const file of bases) {
   const source=fs.readFileSync(path.join(stage,file));
   const raw=hash(source);
   const prior=canReuseLocale ? reusableState.pages[file] : undefined;
   const base=file==='index.html' ? '/' : '/'+file;
   const outputs=LOCALES.map(({prefix})=>prefix ? prefix.slice(1)+'/'+file : file);
   if(prior?.raw===raw && outputs.every(name=>Object.hasOwn(reusableState.outputs,name)) && (sameLocaleInputs || localizer.matches(prior.dependencies))){
    for(const name of outputs)reuseArtifact(name);
    pages[file]=prior;
    reusable.add(file);
   } else {
    const html=source.toString('utf8');
    const archive=html.includes('data-archive');
    if(!archive&&!html.includes('class="v2"'))continue;
    const result=await localizer.render(html,'/'+file);
    pages[file]={raw,dependencies:result.record,indexable:archive&&/<meta name="robots" content="index,follow"\s*\/?>/.test(html)};
    for(const {locale,html} of result.pages){
     const name=locale.prefix ? locale.prefix.slice(1)+'/'+file : file;
     const target=path.join(stage,name);
     fs.mkdirSync(path.dirname(target),{recursive:true});
     fs.writeFileSync(target,html);
     knownOutputs.set(name,hash(html));
     localized++;
    }
   }
   if(pages[file].indexable)urls.push(base);
  }
  if(!urls.includes('/'))throw Error('The indexable home page is missing from the sitemap');
  reusedLanguagePages=reusable.size*LOCALES.length;
  endPhase('localize');
  console.log(`[i18n] ${localized} localized, ${reusedLanguagePages} reused`);
  ai=writeAiContent(stage,snapshot,{previousDir:reusableState ? previous : null,previousState:reusableState});
  console.log('[ai-content] '+JSON.stringify(ai));
  openApi=writeOpenApi(stage,snapshot,{previousDir:reusableState ? previous : null,previousState:reusableState});
  console.log('[open-api] '+JSON.stringify(openApi));
  endPhase('exports');
  audit=auditLanguagePages(stage,{snapshot,previous:reusableState?.audit,reusable,digests:knownOutputs,reportFile:path.join(root,'.build/native-localization-audit.json')});
  endPhase('audit');
  let previousSitemap={records:new Map(),seeded:0};
  try {
   previousSitemap=reusableState ? {records:new Map(Object.entries(reusableState.sitemap)),seeded:0} : readSitemapHistory(previous,{origin:ORIGIN,now:buildTime});
  } catch(error){console.warn('[sitemap] previous history unavailable: '+error.message);}
  const unchangedPaths=new Set([...reusable].flatMap(file=>LOCALES.map(locale=>localizedPath('/'+file,locale))));
  const sitemap=updateSitemapHistory(urls.flatMap(base=>LOCALES.map(locale=>localizedPath(base,locale))),stage,previousSitemap,{unchangedPaths,now:buildTime});
  const sitemapImages=new Map();
  for(const work of snapshot.works||[]){
    if(work.status!=='published')continue;
    const image=sitemapWorkImage(work);
    // Never advertise the placeholder: an unindexed image is better than a blank result.
    if(image)sitemapImages.set('/works/'+work.slug+'.html',image);
  }
  fs.writeFileSync(path.join(stage,'sitemap.xml'),languageSitemap(urls,sitemap.lastmods,sitemapImages));
  history=Object.fromEntries(sitemap.records);
  console.log(`[sitemap] ${sitemap.unchanged} unchanged, ${sitemap.changed} changed, ${sitemap.added} new`);
  for(const base of urls)for(const locale of LOCALES) {
   const route=localizedPath(base,locale),file=route.endsWith('/')?route+'index.html':route;
   if(!fs.existsSync(path.join(stage,file.slice(1))))throw Error('Language page missing: '+route);
  }
  endPhase('sitemap');
 }
 // A missing placeholder turns every fallback into a broken image (issue #33).
 // Check the finished stage so noop and validated-prebuilt releases are covered too.
 const placeholder=path.join(stage,'components','image-placeholder.svg');
 let placeholderStat=null;try{placeholderStat=fs.statSync(placeholder);}catch{}
 if(!placeholderStat?.isFile()||placeholderStat.size===0)throw Error('components/image-placeholder.svg is missing or empty from the release');
 const git=(dir)=>spawnSync('git',['-C',dir,'rev-parse','HEAD'],{encoding:'utf8'}).stdout?.trim()||null;
 const state={version:STATE_VERSION,inputs:plan.inputs,routes:plan.routes,pages,audit,outputs:outputHashes(stage,knownOutputs),sitemap:history,baselineSitemap,localeInputHash};
 endPhase('inventory');
 const report={
  version:STATE_VERSION,mode:preflight?'prebuilt':plan.mode,
  reasons:preflight?['validated-prebuilt-artifact']:plan.reasons,preflight:preflight||null,
  sourceCommit:git(root),contentCommit:process.env.CONTENT_DIR?git(process.env.CONTENT_DIR):null,
  planned:preflight?.planned||{changed:plan.changed.length,reused:plan.reused.length,removed:plan.removed.length},
  rendered:(plan.rendered||[]).length,localized,reusedLanguagePages,reusedAssets,markdown:ai,openApi,timings,
  seconds:Number(((performance.now()-started)/1000).toFixed(2)),
 };
 fs.writeFileSync(path.join(stage,STATE_FILE),JSON.stringify(state));
 fs.writeFileSync(path.join(stage,'.build-plan.json'),JSON.stringify(plan,null,2));
 fs.writeFileSync(path.join(stage,'build-info.json'),JSON.stringify(report,null,2)+'\n');
 fs.writeFileSync(path.join(stage,'.build-output'),'frontend/scripts/build.mjs\n');
 fs.writeFileSync(path.join(root,'.build/build-plan.json'),JSON.stringify(plan,null,2));
 if(fs.existsSync(out))fs.rmSync(out,{recursive:true});
 fs.renameSync(stage,out);completed=true;
 console.log('[build-result] '+JSON.stringify(report));
 console.log('[astro] output '+out);
} finally {
 if(!completed)fs.rmSync(stage,{recursive:true,force:true});
 fs.rmSync(planFile,{force:true});
}
