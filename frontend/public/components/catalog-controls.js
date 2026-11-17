export function installCatalogFilters() {
 const form=document.getElementById('filter-form');
 const chips=[...document.querySelectorAll('[data-catalog-type]')];
 if(!form||!chips.length)return;
 const select=form.elements.type;
 const paint=()=>chips.forEach(button=>{
  const active=button.dataset.catalogType===select.value;
  button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));
 });
 chips.forEach(button=>button.addEventListener('click',()=>{
  select.value=button.dataset.catalogType;
  select.dispatchEvent(new Event('change',{bubbles:true}));
 }));
 form.addEventListener('change',paint);
 form.addEventListener('reset',()=>queueMicrotask(paint));
 paint();
}
