#!/usr/bin/env node
// Localize the staged pages and export AI/Open API artifacts. Exit before the
// audit so dependency indexes and localization DOMs are released.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fork} from 'node:child_process';
import {availableParallelism} from 'node:os';
import {prepareLocalization,LOCALES} from './localize-pages.mjs';
import {writeAiContent} from './ai-content.mjs';
import {writeOpenApi} from './open-api.mjs';
import {readState,hash,copyArtifact,filesIn,excludeInvalidArtifacts} from './incremental.mjs';

const usage='Usage: build-page-output.mjs <stage> <planFile> <previous> <stateFile> <resultFile>';
const [stage,planFile,previous,stateFile,resultFile]=process.argv.slice(2);
if([stage,planFile,previous,stateFile,resultFile].some(value=>!value))throw Error(usage);
const frontend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const plan=JSON.parse(fs.readFileSync(planFile,'utf8'));
// Shared toolchain changes can alter parsing and conversion without changing Astro HTML.
const reusableState = plan.mode === 'full' ? null : excludeInvalidArtifacts(readState(stateFile),plan.invalidArtifacts);
if (plan.mode !== 'full' && !reusableState) throw Error('Previous build state is missing or incompatible: '+stateFile);
const localizationState = plan.localizationCompatible && reusableState?.inputs.localization === plan.inputs.localization ? reusableState : null;

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
const canParallelize=Boolean(localizationState) && availableParallelism()>1;
let localeWorker;
function renderInWorker(html, base, locale) {
  localeWorker ??= fork(fileURLToPath(new URL('./localize-worker.mjs', import.meta.url)), [stage], {
    execArgv: ['--max-old-space-size=224'],
  });
  return new Promise((resolve, reject) => {
    const finish = (error, result) => {
      localeWorker.off('message', onMessage);
      localeWorker.off('exit', onExit);
      localeWorker.off('error', onError);
      if (error) reject(error);
      else resolve(result);
    };
    const onMessage = ({error, result}) => finish(error ? Error(error) : null, result);
    const onExit = (code, signal) => finish(Error('Localization worker stopped: ' + (signal || code)));
    const onError = error => finish(error);
    localeWorker.once('message', onMessage);
    localeWorker.once('exit', onExit);
    localeWorker.once('error', onError);
    localeWorker.send({html, base, locale}, error => { if (error) finish(error); });
  });
}
const dictionaries=[
 plan.inputs.dictionaries,
 ...['archive-copy.js','archive-labels.js'].map(file=>hash(fs.readFileSync(path.join(stage,file)))),
];
const localeInputHash=hash([plan.inputs.content,...dictionaries]);
const sameLocaleInputs=localeInputHash===localizationState?.localeInputHash;
// The snapshot carries every work field used by the localizer. Other data and
// assembled dictionaries conservatively invalidate this fast path.
const localeInputs=Object.fromEntries(LOCALES.map(({id})=>{
 const data=JSON.stringify(snapshot,(key,value)=>{
  if ((key==='i18n'||key==='creditsI18n') && value && typeof value==='object' && !Array.isArray(value)) return value[id];
  return value;
 });
 return [id,hash([id,plan.inputs.localeExternal,dictionaries,hash(data)])];
}));
const unchangedLocale=new Set(LOCALES.filter(({id})=>sameLocaleInputs || localeInputs[id]===localizationState?.localeInputs?.[id]).map(({id})=>id));
const localeStats = Object.fromEntries(LOCALES.map(({id}) => [id, {generated: 0, reused: 0}]));
const urls=[];
let localized = 0;
const output = fs.openSync(resultFile, 'wx');
try {
  // Write one record at a time so dependency data does not accumulate in the
  // localization heap. The parent reads this file only after the child exits successfully.
  fs.writeFileSync(output, '{"pages":{');
  let separator = '';
  for (const file of bases) {
    const source = fs.readFileSync(path.join(stage, file));
    const raw = hash(source);
    const entries = localizationState?.pages;
    const prior = entries && Object.hasOwn(entries, file) ? entries[file] : null;
    const unchangedSource = prior?.raw === raw;
    const archive = source.includes('data-archive');
    if (!archive && !source.includes('class="v2"')) continue;
    let html;
    const indexable = unchangedSource ? prior.indexable
      : archive && /<meta name="robots" content="index,follow"\s*\/?>/.test(html ??= source.toString('utf8'));
    const page = {raw, indexable, locales: {}};
    const missing=[];
    for (const locale of LOCALES) {
      const name = locale.prefix ? locale.prefix.slice(1) + '/' + file : file;
      const dependencies = unchangedSource ? prior.locales?.[locale.id] : null;
      if (dependencies && Object.hasOwn(reusableState.outputs, name)
        && (unchangedLocale.has(locale.id) || localizer.matches(dependencies, locale))) {
        reuseArtifact(name);
        page.locales[locale.id] = dependencies;
        localeStats[locale.id].reused++;
        continue;
      }
      missing.push({locale,name});
    }
    const writePage = ({locale,name}, result) => {
      const target = path.join(stage, name);
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.writeFileSync(target, result.html);
      knownOutputs.set(name, hash(result.html));
      page.locales[locale.id] = result.dependencies;
      localeStats[locale.id].generated++;
      localized++;
    };
    if (missing.length) html ??= source.toString('utf8');
    for (let index=0; index<missing.length; index++) {
      const current=missing[index], next=missing[index+1];
      if (canParallelize && next) {
        const [first,second]=await Promise.all([
          renderInWorker(html,'/'+file,next.locale),
          localizer.render(html,'/'+file,current.locale),
        ]);
        writePage(current,second);
        writePage(next,first);
        index++;
      } else {
        writePage(current,await localizer.render(html,'/'+file,current.locale));
      }
    }
    fs.writeFileSync(output, separator + JSON.stringify(file) + ':' + JSON.stringify(page));
    separator = ',';
    if (page.indexable) urls.push(file === 'index.html' ? '/' : '/' + file);
  }
  if (!urls.includes('/')) throw Error('The indexable home page is missing from the sitemap');
  const reusedLanguagePages = Object.values(localeStats).reduce((sum, locale) => sum + locale.reused, 0);
  endPhase('localize');
  console.log(`[i18n] ${localized} localized, ${reusedLanguagePages} reused`);
  const ai = writeAiContent(stage, snapshot, {previousDir: reusableState ? previous : null, previousState: reusableState});
  console.log('[ai-content] ' + JSON.stringify(ai));
  const openApi = writeOpenApi(stage, snapshot, {previousDir: reusableState ? previous : null, previousState: reusableState});
  console.log('[open-api] ' + JSON.stringify(openApi));
  endPhase('exports');
  const rest = JSON.stringify({localeInputHash, localeInputs, urls, knownOutputs: [...knownOutputs], localized, reusedLanguagePages, localeStats, ai, openApi, timings});
  fs.writeFileSync(output, '},' + rest.slice(1));
} finally {
  if (localeWorker?.connected) localeWorker.disconnect();
  fs.closeSync(output);
}
