export function installSubmissionUpload() {
 const input=document.getElementById('f-files'),drop=document.querySelector('[data-upload-drop]'),selected=document.querySelector('[data-upload-selected]');
 if(!input||!drop||!selected)return;
 const paint=()=>{const file=input.files?.[0];selected.hidden=!file;selected.textContent=file?file.name+' · '+(file.size/1048576).toFixed(2)+' MiB':'';};
 drop.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();input.click();}});
 drop.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('is-drag');});
 drop.addEventListener('dragleave',()=>drop.classList.remove('is-drag'));
 drop.addEventListener('drop',event=>{
  event.preventDefault();drop.classList.remove('is-drag');
  if(!event.dataTransfer?.files?.length)return;
  input.files=event.dataTransfer.files;
  input.dispatchEvent(new Event('change',{bubbles:true}));
 });
 input.addEventListener('change',paint);
 input.form?.addEventListener('reset',()=>queueMicrotask(paint));
 paint();
}
