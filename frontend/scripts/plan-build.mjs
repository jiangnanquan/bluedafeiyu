import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildInputs,readState,verifyPrevious,makePlan,filesIn,hash,STATE_FILE,STATE_VERSION} from './incremental.mjs';

const [root,previousDir,stateFile,target,force,candidate,baselineSitemap]=process.argv.slice(2);
// Hash the exact inputs before the model registry is loaded: an unchanged release can
// answer from verified state without building any page body.
const inputs=buildInputs(root);
const write=plan=>{
  fs.writeFileSync(target,JSON.stringify(plan,null,2));
  console.log(`[build-plan] ${plan.mode}: ${plan.changed.length} changed, ${plan.reused.length} reusable, ${plan.removed.length} removed${plan.reasons.length?'; '+plan.reasons.join(', '):''}`);
};
if(candidate && force!=='true' && fs.existsSync(path.join(candidate,'.build-output'))) {
  const state=readState(path.join(candidate,STATE_FILE));
  let report;
  try { report=JSON.parse(fs.readFileSync(path.join(candidate,'build-info.json'),'utf8')); } catch {}
  if(state && report?.version===STATE_VERSION && state.baselineSitemap===(baselineSitemap||null)) {
    const sameInputs=Object.keys(inputs).every(key=>inputs[key]===state.inputs[key]);
    if(sameInputs && verifyPrevious(candidate,state).ok) {
      const plan=makePlan(inputs,state.routes,state,{ok:true});
      plan.preflight={mode:report.mode,rendered:report.rendered,localized:report.localized,seconds:report.seconds,planned:report.planned};
      console.log('[build-plan] reuse validated preflight artifact');
      write(plan);
      process.exit(0);
    }
  }
}
const previous=readState(stateFile);
const validation=verifyPrevious(previousDir,previous);
if(previous && force!=='true') {
  const decision=makePlan(inputs,previous.routes,previous,validation);
  if(decision.mode==='noop'){write(decision);process.exit(0);}
}
const pagesDir=path.join(root,'frontend/src/pages');
const modelURL=pathToFileURL(path.join(root,'frontend/src/lib/archive.mjs'));
const {archivePages}=await import(modelURL.href);
const models=new Map([...archivePages].map(([url,page])=>[url,page.cacheKey]));

// A model URL without a page route would be rendered by nothing and then pruned from
// the release, so the plan refuses to guess instead of silently losing the page.
function routePattern(file){
  const segments=file.replace(/\.astro$/,'').split('/');
  const rest=segments.at(-1).startsWith('[...');
  const parts=segments.map(segment=>{
    if(segment.startsWith('[...')) return '(.+)';
    if(segment.startsWith('[')) return '([^/]+)';
    return segment.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  });
  return new RegExp('^/'+parts.join('/')+(rest?'':'\\.html')+'$');
}
const pageFiles=filesIn(pagesDir);
const astroRoutes=pageFiles.filter(file=>file.endsWith('.astro')).map(file=>({file,pattern:routePattern(file)}));
const routes={};
const unmatched=[];
for(const [url,key] of models) {
  if(astroRoutes.some(route=>route.pattern.test(url))) routes[url]=key;
  else unmatched.push(url);
}
if(unmatched.length) throw Error(`No Astro page renders model route(s): ${unmatched.slice(0,5).join(', ')}${unmatched.length>5?` (+${unmatched.length-5} more)`:''}`);

// Static pages without a model are tracked by Astro's own dependency hash, but their
// components also read the snapshot through `site.mjs`/`v2.mjs` at load time, which is
// an fs read Astro cannot see. Only this handful of routes pays for that dependency.
const staticKey=file=>{
  const url='/'+file.replace(/\.astro$/,'.html');
  const literal=fs.readFileSync(path.join(pagesDir,file),'utf8').match(/archivePages\.get\(\s*['"]([^'"]+\.html)['"]\s*\)/);
  if(literal&&models.has(literal[1])) return models.get(literal[1]);
  return hash(['static-route',url,inputs.snapshot??inputs.content]);
};
for(const {file} of astroRoutes) {
  if(file.includes('[')) continue;
  const url='/'+file.replace(/\.astro$/,'.html');
  if(!Object.hasOwn(routes,url)) routes[url]=staticKey(file);
}

// Prerendered endpoints are data builders. Hashing their actual response keeps file
// reads (site-data, localizations, terminology) and model payloads in the route gate.
async function endpointBody(module,item){
  if(typeof module.GET!=='function') return null;
  const response=await module.GET({params:item.params});
  const body=response instanceof Response?await response.text():response;
  return typeof body==='string'?body:JSON.stringify(body??null);
}
for(const file of pageFiles.filter(file=>/\.(?:js|mjs)$/.test(file))) {
  const endpoint=await import(pathToFileURL(path.join(pagesDir,file)).href);
  const paths=typeof endpoint.getStaticPaths==='function'?await endpoint.getStaticPaths():[{params:{}}];
  for(const item of paths) {
    const route='/'+file.replace(/\.(?:js|mjs)$/,'').replace(/\[([^\]]+)\]/g,(_,key)=>{
      if(item.params[key]===undefined) throw Error('Unknown endpoint parameter: '+file);
      return item.params[key];
    });
    routes[route]=hash(['endpoint',route,await endpointBody(endpoint,item)]);
  }
}

write(makePlan(inputs,routes,previous,validation,force==='true'));
