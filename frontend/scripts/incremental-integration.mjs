import fs from 'node:fs';
import {hash,routeFile} from './incremental.mjs';

const MODEL_BINDING='__bluefishArchiveModel';
const MODEL_MODULE='\0virtual:bluefish-archive-model';
const MODEL_FILE='src/lib/archive.mjs';

// Astro owns the templates and their static imports. The archive registry is a pure
// Node data producer, so the build resolves its import to this stable virtual module:
// business `.mjs` edits stay out of Astro's per-route dependency hash, while model
// markup is still invalidated by the planner's output keys and the route cacheKey.
function archiveModelPlugin(){
  return {
    name:'bluefish-archive-model',
    enforce:'pre',
    resolveId(source){
      if(source===MODEL_MODULE) return MODEL_MODULE;
      if(this.environment?.name==='client') return null;
      return /(^|\/)lib\/archive\.mjs$/.test(source)?MODEL_MODULE:null;
    },
    load(id){
      if(id!==MODEL_MODULE) return null;
      return [
        `const model=globalThis[${JSON.stringify(MODEL_BINDING)}];`,
        `if(!model)throw new Error('Archive model is not initialised; the build integration must load it before rendering.');`,
        'export const archivePages=model.archivePages;',
        'export const archiveContext=model.archiveContext;',
        'export const archiveTranslations=model.archiveTranslations;',
        'export const archiveData=model.archiveData;'
      ].join('\n');
    }
  };
}

// Shared script endpoints read the mutable translation registry, which lazy page bodies
// populate. Materialising once keeps endpoint output identical to a full render instead
// of depending on which pages this incremental build happened to render.
async function ensureArchiveModel(root){
  const loaded=globalThis[MODEL_BINDING];
  if(loaded) return loaded;
  const model=await import(new URL(MODEL_FILE,root).href);
  for(const page of model.archivePages.values())page.content;
  globalThis[MODEL_BINDING]=model;
  return model;
}

// Public Astro 7 prerenderer API. Astro owns template dependency tracking and its cache.
export function incrementalIntegration() {
  let root;
  return {name:'site-incremental-plan',hooks:{
    'astro:config:setup'({command,config,updateConfig}) {
      root=config.root;
      // Development keeps the direct model import so HMR behaves as before.
      if(command==='build') updateConfig({vite:{plugins:[archiveModelPlugin()]}});
    },
    async 'astro:build:start'({setPrerenderer}) {
      await ensureArchiveModel(root);
      const planFile=process.env.SITE_BUILD_PLAN_FILE;
      if (!planFile) return;
      const plan=JSON.parse(fs.readFileSync(planFile,'utf8'));
      const rendered=[];
      setPrerenderer(base=>({
        name:'site-incremental-prerenderer',
        setup:()=>base.setup?.(),
        async getStaticPaths() {
          const paths=await base.getStaticPaths();
          return paths.map(item=>{
            const file=routeFile(item.pathname,item.route), key='/'+file;
            // Static endpoints and informational pages also depend on the exported catalog.
            const model=plan.routes[key] || hash(plan.inputs);
            plan.routes[key]=model;
            return {...item,cacheKey:hash([model,plan.inputs.build,plan.inputs.runtime])};
          });
        },
        async render(request, options) {
          rendered.push('/'+routeFile(new URL(request.url).pathname,options.routeData));
          return base.render(request,options);
        },
        collectStaticImages:base.collectStaticImages?.bind(base),
        async teardown() {
          await base.teardown?.();
          fs.writeFileSync(planFile,JSON.stringify({...plan,rendered},null,2));
        }
      }));
    },
    'astro:build:done'() {
      delete globalThis[MODEL_BINDING];
    }
  }};
}
