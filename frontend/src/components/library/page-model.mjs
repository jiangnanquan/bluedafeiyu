import crypto from 'node:crypto';
export const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

// A route's build identity is the markup and metadata it renders, not the catalog it
// could read. Detail templates are materialised by the planner like aggregate pages,
// so an unrelated record edit no longer invalidates every page.
export function createPageModel(ctx, url, title, active, content, options = {}) {
  const meta=ctx.seo.metadata(url,title,active,options);
  let value;
  const transforms=[];
  const page={url,title,active,options,meta,
    get content() {
      if (value===undefined) value=ctx.seo.enrich(url,typeof content==='function'?content():content);
      for (const transform of transforms.splice(0)) value=transform(value);
      return value;
    },
    set content(next) {value=next;},
    transformContent(transform) {transforms.push(transform);},
    get cacheKey() {
      // `sharedKey` covers model markup rendered by shared templates (dialogs, icon
      // buttons) instead of by this page body, so those edits still invalidate routes.
      return digest([url,title,active,options,meta,page.content,ctx.sharedKey ?? null]);
    }
  };
  return page;
}
