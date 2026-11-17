export function installComicReader() {
 const reader=document.querySelector('[data-comic-reader]');
 if(!reader||reader.dataset.comicPage==='0')return;
 document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||document.querySelector('dialog[open]')||document.getElementById('app')?.classList.contains('menu-open')||event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
  const links=[...reader.querySelectorAll('.comic-navigation a')];
  const target=event.key==='ArrowLeft'?links.find(a=>a.href.includes('/page/'+(Number(reader.dataset.comicPage)-1)+'.html')):event.key==='ArrowRight'?links.find(a=>a.href.includes('/page/'+(Number(reader.dataset.comicPage)+1)+'.html')):null;
  if(target){event.preventDefault();location.href=target.href;}
 });
}
