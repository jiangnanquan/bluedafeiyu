import {installCatalogFilters} from '../../public/components/catalog-controls.js';
import {installSubmissionUpload} from '../../public/components/submission-upload.js';
import {installComicReader} from '../../public/components/comic-reader.js';
import {installSubmissionTabs} from '../../public/components/submission-tabs.js';
import {installSidebar} from '../../public/components/sidebar-state.js';
import {installCommunityProjects} from '../../public/components/community-projects.js';
import {installCreatorDirectory,installCreatorRails} from '../../public/components/creator-directory.js';
import {installPagedFeeds} from '../../public/components/paged-feed.js';
import {installHomeRankings} from '../../public/components/home-rankings.js';
import './saved-ui.js';
installPagedFeeds();
installCatalogFilters();
installComicReader();
installSidebar();
installHomeRankings();

const searchInput = document.querySelector('.topbar input[type="search"]');
const shortcut = document.querySelector('.topbar kbd');
if (searchInput && shortcut) {
  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
  shortcut.textContent = /Mac|iPhone|iPad|iPod/i.test(platform) ? '⌘ K' : 'Ctrl K';
  document.addEventListener('keydown', event => {
    if (!event.defaultPrevented && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' &&
        !document.body.classList.contains('sidebar-drawer-open') && !document.querySelector('dialog[open]')) {
      event.preventDefault();
      searchInput.focus();
    }
  });
}

installSubmissionTabs();
installSubmissionUpload();

const friendFilters=[...document.querySelectorAll('[data-friend-filter]')];
if(friendFilters.length){
  const select=()=>{
    const requested=location.hash.slice(1), category=['project','website'].includes(requested)?requested:'all';
    friendFilters.forEach(link=>{if(link.dataset.friendFilter===category)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');});
    document.querySelectorAll('[data-project-nav]').forEach(link=>{
      const selected=link.dataset.projectNav===(category==='project'?'communityProjects':'friendWall');
      link.classList.toggle('is-active',selected);
      if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-friend-section]').forEach(section=>section.hidden=category!=='all'&&section.dataset.friendSection!==category);
  };
  window.addEventListener('hashchange',select);select();
}

installCreatorDirectory();

for(const row of document.querySelectorAll('.creator-row-card')){
  const rail=row.querySelector('[data-creator-rail]');
  const buttons=[...row.querySelectorAll('[data-design-rail]')];
  const status=row.querySelector('[data-design-rail-status]');
  if(!rail||!status)continue;
  const paint=()=>{
    const child=rail.firstElementChild;
    if(!child||!rail.clientWidth)return;
    const gap=parseFloat(getComputedStyle(rail).gap)||0;
    const step=child.getBoundingClientRect().width+gap;
    const first=Math.round(rail.scrollLeft/step)+1;
    const count=Math.max(1,Math.round((rail.clientWidth+gap)/step));
    status.textContent=first+'–'+Math.min(rail.children.length,first+count-1)+' / '+rail.children.length;
    buttons[0].disabled=rail.scrollLeft<2;
    buttons[1].disabled=rail.scrollLeft+rail.clientWidth>=rail.scrollWidth-2;
  };
  buttons.forEach(button=>button.addEventListener('click',()=>rail.scrollBy({left:Number(button.dataset.designRail)*rail.clientWidth,behavior:'smooth'})));
  rail.addEventListener('scroll',paint,{passive:true});new ResizeObserver(paint).observe(rail);paint();
}

const authorFeed=document.querySelector('[data-author-feed]');
if(authorFeed){
  const links=[...document.querySelectorAll('[data-author-type]')];
  const select=()=>{
    const type=new URLSearchParams(location.hash.slice(1)).get('type')||'all';
    links.forEach(link=>{const selected=link.dataset.authorType===type;link.classList.toggle('is-active',selected);if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    if(!authorFeed.closest('[data-paged-feed]'))[...authorFeed.children].forEach(card=>card.hidden=type==='image'?card.matches('.video-card'):type==='video'?card.matches('.work-card'):false);
  };
  window.addEventListener('hashchange',select);select();
}
window.WorkStats?.paint();

installCreatorRails();
installCommunityProjects();
