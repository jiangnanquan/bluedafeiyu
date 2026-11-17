export function installVideoSort() {
 const grid=document.querySelector('[data-video-grid]'),select=document.querySelector('[data-video-sort]');
 if(!grid||!select)return;
 select.addEventListener('change',()=>{
  const direction=select.value==='oldest'?1:-1;
  [...grid.children].sort((a,b)=>direction*(Date.parse(a.dataset.published)-Date.parse(b.dataset.published))).forEach(card=>grid.appendChild(card));
 });
}
