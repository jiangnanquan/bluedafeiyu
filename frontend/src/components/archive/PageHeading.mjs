// Shared heading structure. Callers pass escaped text or component-rendered HTML.
export function renderPageHeading({ eyebrow = '', title, description = '', extra = '' }) {
  return `<header class="page-head page-hero">${eyebrow ? `<div class="eyebrow"><span>${eyebrow}</span><i aria-hidden="true"></i></div>` : ''}<h1>${title}</h1>${description ? `<p class="hero-sub lede">${description}</p>` : ''}${extra}</header>`;
}

export function renderSectionHeading({title, description='', extra='', variant='line'}) {
  const note=description?`<span>${description}</span>`:'';
  return `<div class="${variant==='bar'?'sec-bar':'sec'}"><h2>${title}</h2>${variant==='bar'?note+extra:note||extra?`<div class="sec-side">${note}${extra}</div>`:''}</div>`;
}
