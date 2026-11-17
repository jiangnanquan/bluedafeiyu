import {workImageAlt} from './image-alt.js';
import {workPreviewAttributes} from './work-preview.js';
import {renderSaveButton} from '../archive/saved-items.js';
import {renderShareButton} from './share-card-model.js';
import {workImageURL} from './work-image.js';
// One renderer for Astro's static HTML and cards appended in the browser.
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const kindNames = {meme:'梗图',illustration:'插画',setting:'设定图',comic:'漫画',standing:'立绘',other:'其他'};
export function renderWorkCard(work, {url = value => value, translate = (_key,value) => value, names = value => value, eager = false, priority = false} = {}) {
  work = {...work, i: workImageURL(work.i)};
  const href = esc(url('/works/' + work.slug + '.html'));
  const roles = work.roles || [{id: work.cid, name: work.c, color: work.col}];
  const roleLinks = roles.map(role => `<a data-character-id="${esc(role.id)}" href="${esc(url('/characters/' + role.id + '.html'))}">${esc(names(role.name))}</a>`).join(' / ');
  const kinds = work.k.map(id => `<span data-i18n="v2.type.${esc(id)}">${esc(translate('v2.type.' + id, kindNames[id] || id))}</span>`).join(' · ');
  const [width,height]=work.p || [work.w||480,work.h||480];
  const long=height/width>2.8;
  const owners=(work.owners||[]).map(c=>`<a href="${esc(url(c.href))}">${esc(c.name)}</a>`).join(' / ');
  const preview = esc(translate('d.quickView','预览') + ' ' + names(work.n));
  return `<article class="work-card" data-slug="${esc(work.slug)}">
    <a class="work-art work-cover${long?' is-long':''}" ${workPreviewAttributes(work.slug)} aria-label="${preview}" href="${href}"><img src="${esc(work.i)}" alt="${esc(workImageAlt(work, names))}" width="${width}" height="${height}" loading="${eager ? 'eager' : 'lazy'}"${priority?' fetchpriority="high"':''} decoding="async"><span class="work-kind">${kinds}</span>${work.lk?`<span class="work-license" data-i18n="v2.licenseShort.${esc(work.lk)}" data-i18n-attr="title:license.${esc(work.lk)}" title="${esc(translate('license.'+work.lk,work.lt||''))}">${esc(translate('v2.licenseShort.'+work.lk,work.ls||work.lt||''))}</span>`:''}${long?`<span class="long-image-note" data-i18n="d.longImage">${esc(translate('d.longImage','长图 · 点击看全'))}</span>`:''}</a>
    <button class="quick-view card-preview" type="button" ${workPreviewAttributes(work.slug)} aria-label="${preview}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></svg></button>
    ${renderSaveButton('works',work.slug,{translate,className:'card-save'})}
    ${renderShareButton('/works/' + work.slug + '.html', {translate, compact:true})}
    <a class="work-title" ${workPreviewAttributes(work.slug)} aria-label="${preview}" href="${href}">${esc(names(work.n))}</a>${owners?`<div class="work-owner">${owners}</div>`:''}<div class="work-meta card-meta"><span class="card-roles">${roleLinks}</span> · <span>${kinds}</span><time title="${esc(work.dt)}"> · ${esc(work.dt)}</time></div>
  </article>`;
}
