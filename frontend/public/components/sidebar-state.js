// One state owner for the desktop sidebar and the mobile drawer.
export function sidebarState({mobile, collapsed, drawerOpen}) {
  const open = Boolean(mobile && drawerOpen);
  return {open, sidebarInert:Boolean(mobile && !open), mainInert:open, expanded:mobile ? open : !collapsed};
}

export function installSidebar({document:doc=document, window:win=window}={}) {
  const app=doc.getElementById('app'), sidebar=doc.getElementById('site-sidebar');
  const main=app?.querySelector('.main'), menu=doc.getElementById('menu'), collapse=doc.getElementById('collapse');
  const backdrop=app?.querySelector('[data-drawer-close]');
  if(!app||!sidebar||!main||!menu||!collapse||!backdrop)return;
  const media=win.matchMedia('(max-width:1024px)');
  let collapsed=false, drawerOpen=false;
  try {collapsed=(win.localStorage.getItem('bluedafeiyu-sidebar')||win.localStorage.getItem('bluefish-sidebar'))==='collapsed';} catch {}
  const label=(key,fallback)=>win.SiteLang?.fmt(key,fallback)||fallback;
  function paint(focus=false) {
    const state=sidebarState({mobile:media.matches,collapsed,drawerOpen});
    app.classList.toggle('is-collapsed',collapsed);
    app.classList.toggle('menu-open',state.open);
    doc.body.classList.toggle('sidebar-drawer-open',state.open);
    sidebar.inert=state.sidebarInert;
    main.inert=state.mainInert;
    menu.setAttribute('aria-expanded',String(state.open));
    collapse.setAttribute('aria-expanded',String(state.expanded));
    collapse.setAttribute('aria-label',media.matches
      ?label('d.closeNavigation','关闭导航')
      :label(collapsed?'d.home.expand':'d.home.collapse',collapsed?'展开侧栏':'收起侧栏'));
    if(state.sidebarInert)sidebar.setAttribute('aria-hidden','true');else sidebar.removeAttribute('aria-hidden');
    if(focus)(state.open?collapse:menu).focus({preventScroll:true});
    doc.dispatchEvent(new win.CustomEvent('site:drawerchange',{detail:state}));
  }
  function close(focus=false){drawerOpen=false;paint(focus);}
  menu.addEventListener('click',()=>{drawerOpen=!drawerOpen;paint(true);});
  backdrop.addEventListener('click',()=>close(true));
  collapse.addEventListener('click',()=>{
    if(media.matches){close(true);return;}
    collapsed=!collapsed;
    try{win.localStorage.setItem('bluedafeiyu-sidebar',collapsed?'collapsed':'open');}catch{}
    paint();
  });
  sidebar.addEventListener('click',event=>{if(media.matches&&event.target.closest('a[href]'))close();});
  doc.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&media.matches&&drawerOpen){event.preventDefault();close(true);}
  });
  sidebar.addEventListener('keydown',event=>{
    if(event.key!=='Tab'||!media.matches||!drawerOpen)return;
    const items=[...sidebar.querySelectorAll('a[href],button:not(:disabled)')].filter(el=>el.getClientRects().length);
    const first=items[0],last=items.at(-1);
    if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first?.focus();}
  });
  media.addEventListener('change',()=>{drawerOpen=false;paint();});
  doc.addEventListener('site:langchange',()=>paint());
  paint();
  return {get state(){return sidebarState({mobile:media.matches,collapsed,drawerOpen});}};
}
