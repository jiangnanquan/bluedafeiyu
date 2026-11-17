export function installSubmissionTabs({document=globalThis.document,window=globalThis.window}={}) {
  const tabs=[...document.querySelectorAll('[role="tab"][data-submission-mode]')];
  const image=document.getElementById('image-submission-panel');
  const video=document.getElementById('creator-registration');
  if(!tabs.length||!image||!video)return;
  const select=mode=>{
    image.hidden=mode!=='image';video.hidden=mode!=='video';
    tabs.forEach(tab=>{const active=tab.dataset.submissionMode===mode;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;});
  };
  tabs.forEach((tab,i)=>{
    tab.addEventListener('click',()=>select(tab.dataset.submissionMode));
    tab.addEventListener('keydown',event=>{
      if(!['ArrowRight','ArrowLeft'].includes(event.key))return;
      event.preventDefault();const next=tabs[(i+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length];select(next.dataset.submissionMode);next.focus();
    });
  });
  const location=window.location;
  select(document.body.dataset.submissionMode==='video'||new URLSearchParams(location.search).get('media')==='video'||location.hash==='#creator-registration'?'video':'image');
}
