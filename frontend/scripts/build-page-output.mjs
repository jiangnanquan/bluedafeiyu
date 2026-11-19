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
const baseline = plan.baselineVerified ? readState(stateFile) : null;
if(plan.baselineVerified && !baseline)throw Error('Previous build state is missing or incompatible: '+stateFile);
// Shared toolchain changes can alter parsing and conversion without changing Astro HTML.
const reusableState = plan.mode === 'full' ? null : baseline;
const localizationState = reusableState?.inputs.localization === plan.inputs.localization ? reusableState : null;
const auditState = reusableState?.inputs.audit === plan.inputs.audit ? reusableState?.audit : null;

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
const localeInputHash=hash([
 plan.inputs.content,
 plan.inputs.dictionaries,
 ...['archive-copy.js','archive-labels.js'].map(file=>hash(fs.readFileSync(path.join(stage,file)))),
]);
const sameLocaleInputs=localeInputHash===localizationState?.localeInputHash;
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
    for (const locale of LOCALES) {
      const name = locale.prefix ? locale.prefix.slice(1) + '/' + file : file;
      const dependencies = unchangedSource ? prior.locales?.[locale.id] : null;
      if (dependencies && Object.hasOwn(reusableState.outputs, name)
        && (sameLocaleInputs || localizer.matches(dependencies, locale))) {
        reuseArtifact(name);
        page.locales[locale.id] = dependencies;
        localeStats[locale.id].reused++;
        continue;
      }
      const result = await localizer.render(html ??= source.toString('utf8'), '/' + file, locale);
      const target = path.join(stage, name);
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.writeFileSync(target, result.html);
      knownOutputs.set(name, hash(result.html));
      page.locales[locale.id] = result.dependencies;
      localeStats[locale.id].generated++;
      localized++;
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
  const audit = auditLanguagePages(stage, {snapshot, previous: auditState, digests: knownOutputs, reportFile});
  endPhase('audit');
  const rest = JSON.stringify({localeInputHash, urls, knownOutputs: [...knownOutputs], localized, reusedLanguagePages, localeStats, ai, openApi, audit, timings});
  fs.writeFileSync(output, '},' + rest.slice(1));
} finally {
  fs.closeSync(output);
}
