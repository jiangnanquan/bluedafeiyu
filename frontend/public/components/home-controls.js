(function(){
  var lang=document.getElementById('lang');
  if(!lang)return;
  lang.hidden=false;
  var picker=document.getElementById('language-picker');
  var panel=document.getElementById('language-options');
  var options=Array.from(panel.querySelectorAll('[role="option"]'));
  function closeLanguage(restore){panel.hidden=true;lang.setAttribute('aria-expanded','false');if(restore)lang.focus({preventScroll:true});}
  function openLanguage(index){panel.hidden=false;lang.setAttribute('aria-expanded','true');options[index||0].focus({preventScroll:true});}
  lang.addEventListener('click',function(){if(panel.hidden)openLanguage(0);else closeLanguage(true);});
  lang.addEventListener('keydown',function(e){if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();openLanguage(e.key==='ArrowUp'?options.length-1:0);}});
  function chooseLanguage(option){
    var prefix={'zh-CN':'','zh-TW':'/zh-hant','en':'/en','ja':'/ja'}[option.dataset.value];
    var path=prefix+location.pathname.replace(/^\/(?:en|ja|zh-hant)(?=\/)/,'')+location.search+location.hash;
    closeLanguage(true);if(path)location.href=path;
  }
  options.forEach(function(option,index){
    option.addEventListener('click',function(){chooseLanguage(option);});
    option.addEventListener('keydown',function(e){
      var next=index;
      if(e.key==='ArrowDown')next=(index+1)%options.length;
      else if(e.key==='ArrowUp')next=(index+options.length-1)%options.length;
      else if(e.key==='Home')next=0;
      else if(e.key==='End')next=options.length-1;
      else if(e.key==='Enter'||e.key===' '){e.preventDefault();chooseLanguage(option);return;}
      else return;
      e.preventDefault();options[next].focus({preventScroll:true});
    });
  });
  document.addEventListener('pointerdown',function(e){if(!picker.contains(e.target))closeLanguage(false);});
  picker.addEventListener('focusout',function(e){if(!picker.contains(e.relatedTarget))closeLanguage(false);});
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&!panel.hidden){e.preventDefault();closeLanguage(true);}
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();document.querySelector('.search input').focus();}
  });

  theme.setAttribute('aria-pressed',String(document.documentElement.getAttribute('data-theme')==='dark'));
  function syncLanguage(){
    var current=window.SiteLang?.current||'zh';
    var value={zh:'zh-CN','zh-Hant':'zh-TW',en:'en',ja:'ja'}[current];
    var label={zh:'简中','zh-Hant':'繁中',en:'EN',ja:'日本語'}[current];
    lang.querySelector('span').textContent=label;
    lang.setAttribute('aria-label',label);
    options.forEach(option=>option.setAttribute('aria-selected',String(option.dataset.value===value)));
    for(const option of document.querySelectorAll('[data-filter-picker="character"] [data-character-id]')) option.textContent=window.SiteLang?SiteLang.characterName(option.dataset.characterId,option.textContent):option.textContent;
  }
  document.addEventListener('site:langchange',syncLanguage);
  document.addEventListener('site:drawerchange',function(){closeLanguage(false);});
  syncLanguage();
})();
