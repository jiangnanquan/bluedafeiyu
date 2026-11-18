#!/usr/bin/env node
// Localize the staged pages, export AI/Open API artifacts and audit them in a
// child process so the temporary localization state dies with this process.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareLocalization,LOCALES} from './localize-pages.mjs';
import {writeAiContent} from './ai-content.mjs';
import {writeOpenApi} from './open-api.mjs';
import {readState,hash,copyArtifact,filesIn} from './incremental.mjs';
import {auditLanguagePages} from '../../tools/localization/audit-pages.mjs';

const usage='Usage: build-page-output.mjs <stage> <planFile> <previous> <stateFile> <reportFile> <resultFile>';
const [stage,planFile,previous,stateFile,reportFile,resultFile]=process.argv.slice(2);
if([stage,planFile,previous,stateFile,reportFile,resultFile].some(value=>!value))throw Error(usage);
const frontend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const plan=JSON.parse(fs.readFileSync(planFile,'utf8'));
const reusableState=plan.mode==='full' ? null : readState(stateFile);
if(plan.mode!=='full' && !reusableState)throw Error('Previous build state is missing or incompatible: '+stateFile);

const timings={};
let phaseStart=performance.now();
const endPhase=name=>{
 const now=performance.now();
 timings[name]=Number(((now-phaseStart)/1000).toFixed(2));
 console.log(`[build-phase] ${name} ${timings[name]}s`);
 phaseStart=now;
};

// Astro can restore a cached removed page before pruning its cache. The
// current route plan, plus explicitly public HTML files, defines the release.
const isPublicPage=file=>fs.existsSync(path.join(frontend,'public',file));
const bases=filesIn(stage).filter(name=>name.endsWith('.html')).filter(file=>{
 if(Object.hasOwn(plan.routes,'/'+file)||isPublicPage(file))return true;
 fs.rmSync(path.join(stage,file));
 return false;
});
const knownOutputs=new Map();
const reuseArtifact=name=>{
 copyArtifact(previous,stage,name);
 knownOutputs.set(name,reusableState.outputs[name]);
};
const snapshot=JSON.parse(fs.readFileSync(path.join(stage,'site-data.json'),'utf8'));
const localizer=prepareLocalization(stage,snapshot);
const canReuseLocale=reusableState?.inputs.localization===plan.inputs.localization;
const localeInputHash=hash([
 plan.inputs.content,
 ...['archive-copy.js','archive-labels.js'].map(file=>hash(fs.readFileSync(path.join(stage,file)))),
]);
const sameLocaleInputs=localeInputHash===reusableState?.localeInputHash;
const reusable=new Set();
const urls=[];
const pages={};
let localized=0,reusedLanguagePages=0;
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
const ai=writeAiContent(stage,snapshot,{previousDir:reusableState ? previous : null,previousState:reusableState});
console.log('[ai-content] '+JSON.stringify(ai));
const openApi=writeOpenApi(stage,snapshot,{previousDir:reusableState ? previous : null,previousState:reusableState});
console.log('[open-api] '+JSON.stringify(openApi));
endPhase('exports');
const audit=auditLanguagePages(stage,{snapshot,previous:reusableState?.audit,reusable,digests:knownOutputs,reportFile});
endPhase('audit');
fs.writeFileSync(resultFile,JSON.stringify({pages,localeInputHash,urls,reusable:[...reusable],knownOutputs:[...knownOutputs],localized,reusedLanguagePages,ai,openApi,audit,timings}));
