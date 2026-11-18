// Run with Playwright and Chromium against tools/preview_site.mjs.
// node frontend/tests/frontend-audit-browser.mjs http://127.0.0.1:5173
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';

const entry=process.env.DAFEIYU_PLAYWRIGHT_PATH;
const {chromium}=await import(entry ? pathToFileURL(entry).href : 'playwright');
const origin=new URL(process.argv[2]||'http://127.0.0.1:5173').origin;
const browser=await chromium.launch();
const errors=[];

async function open(options={}, init) {
  const context=await browser.newContext(options);
  if(init) await context.addInitScript(init);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  return page;
}

async function contrast(locator,pseudo) {
  return locator.evaluate((node,pseudo)=>{
    const parse=css=>css.match(/[\d.]+/g).map(Number);
    const luminance=channels=>channels.slice(0,3).map(value=>{
      const s=value/255;
      return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;
    }).reduce((sum,value,i)=>sum+value*[.2126,.7152,.0722][i],0);
    const foreground=luminance(parse(getComputedStyle(node,pseudo).color));
    let rgb;
    for(let el=node;el;el=el.parentElement) {
      rgb=parse(getComputedStyle(el).backgroundColor);
      if(rgb.length===3||rgb[3]>=.99)break;
    }
    const background=luminance(rgb);
    return (Math.max(foreground,background)+.05)/(Math.min(foreground,background)+.05);
  },pseudo);
}

async function assertContrast(locator,min=4.5,pseudo) {
  const actual=await contrast(locator,pseudo);
  assert.ok(actual>=min,`${locator}: ${actual.toFixed(2)}:1 < ${min}:1`);
}

function validateBox(box) {
  assert.ok(box);
  return box;
}

try {
  const desktop=await open({viewport:{width:1520,height:1000}},()=>{
    Object.defineProperty(navigator,'userAgentData',{value:{platform:'Windows'}});
  });
  await desktop.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await desktop.locator('#gallery-tags option').first().waitFor({state:'attached'});
  await assertContrast(desktop.locator('.search input'),4.5,'::placeholder');
  await assertContrast(desktop.locator('.footer-note span').first());
  await assertContrast(desktop.locator('.stats-note'));
  assert.equal(await desktop.locator('kbd').textContent(),'Ctrl K');
  await desktop.keyboard.press('Control+k');
  assert.ok(await desktop.locator('.topbar input').evaluate(node=>document.activeElement===node));

  const gallery=desktop.locator('.home-gallery');
  const cards=gallery.locator('.work-card');
  assert.equal(await cards.count(),24);
  const actions=cards.first().locator('.work-card-actions');
  assert.equal(await actions.evaluate(el=>getComputedStyle(el).opacity),'0');
  await cards.first().hover();
  assert.equal(await actions.evaluate(el=>getComputedStyle(el).opacity),'1');
  await desktop.mouse.move(0,0);
  await cards.first().locator('.work-art').focus();
  assert.equal(await actions.evaluate(el=>getComputedStyle(el).opacity),'1');
  await gallery.locator('[data-catalog-type="meme"]').click();
  const tag=gallery.locator('input[name="tag"]');
  await tag.fill('晚安');await tag.press('Enter');
  assert.equal(new URLSearchParams(new URL(desktop.url()).hash.slice(1)).get('tag'),'晚安');
  assert.ok(await cards.count()>0&&await cards.count()<24);
  await gallery.locator('[data-reset]').click();
  await gallery.locator('[data-load-more]').click();
  assert.equal(await cards.count(),48);

  await desktop.locator('#collapse').click();
  const brand=validateBox(await desktop.locator('.brand-mark').boundingBox());
  const collapse=validateBox(await desktop.locator('#collapse').boundingBox());
  assert.ok(brand.y+brand.height<=collapse.y, 'Collapsed controls must not overlap');
  for(const link of await desktop.locator('.sidebar .nav-item').all()) {
    assert.equal(await link.getAttribute('title'),await link.getAttribute('aria-label'));
  }
  await desktop.locator('#collapse').click();
  for(const link of await desktop.locator('.footer-links a,.sidebar-links a').all()) {
    assert.ok(validateBox(await link.boundingBox()).height>=36);
  }
  await desktop.locator('#theme').click();
  await assertContrast(desktop.locator('.sidebar .cta'));
  await assertContrast(desktop.locator('.brand-mark'),3);
  await desktop.locator('#theme').click();
  await desktop.goto(origin+'/characters/deepseek.html',{waitUntil:'domcontentloaded'});
  const more=desktop.locator('.load-more-wrap .button span').first();
  await more.waitFor();
  await assertContrast(more);
  await desktop.goto(origin+'/submit.html',{waitUntil:'domcontentloaded'});
  await assertContrast(desktop.locator('#type-hint'));
  await desktop.goto(origin+'/community.html',{waitUntil:'domcontentloaded'});
  assert.equal(await desktop.locator('.join-main').evaluate(node=>getComputedStyle(node).backgroundColor),'rgb(21, 67, 180)');
  await desktop.goto(origin+'/en/videos.html',{waitUntil:'domcontentloaded'});
  const videos=desktop.locator('main [data-video-bvid]');
  assert.equal(await videos.count(),24);
  const firstVideo=await videos.first().getAttribute('data-video-bvid');
  await desktop.locator('main a[rel="next"]').click();
  assert.ok(desktop.url().endsWith('/en/videos/page/2.html'));
  assert.notEqual(await videos.first().getAttribute('data-video-bvid'),firstVideo);
  await desktop.locator('main a[href$="/videos/oldest.html"]').click();
  assert.ok(desktop.url().endsWith('/en/videos/oldest.html'));
  assert.notEqual(await videos.first().getAttribute('data-video-bvid'),firstVideo);

  const mobile=await open({viewport:{width:320,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  await mobile.goto(origin+'/',{waitUntil:'domcontentloaded'});
  assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.ok(validateBox(await mobile.locator('.topbar').boundingBox()).height<=70);
  const first=mobile.locator('.home-gallery .work-card').first();
  const art=validateBox(await first.locator('.work-art').boundingBox());
  const touchTargets=await first.locator('.work-card-actions button').all();
  assert.equal(touchTargets.length,3);
  for(const target of touchTargets) {
    const area=validateBox(await target.boundingBox());
    assert.ok(area.x>=0&&area.y>=art.y+art.height&&area.width>=44&&area.height>=44);
  }

  const mac=await open({viewport:{width:1300,height:900}},()=>{
    Object.defineProperty(navigator,'userAgentData',{value:{platform:'macOS'}});
  });
  await mac.goto(origin+'/en/#type=meme',{waitUntil:'domcontentloaded'});
  assert.equal(await mac.locator('kbd').textContent(),'⌘ K');
  assert.match(await mac.title(),/^Blue Dafeiyu/);
  await mac.locator('#lang').click();
  await mac.getByRole('option',{name:'日本語'}).click();
  await mac.waitForURL(/\/ja\/#type=meme/);
  assert.equal(await mac.evaluate(()=>localStorage.getItem('bluedafeiyu-lang')),'ja');

  await mac.route('**/submit.html',async route=>{
    const response=await route.fetch();
    const html=(await response.text()).replace(/<form(?=[^>]*\bid="(?:submission-form|creator-registration-form)")/g,'<form data-turnstile-sitekey="local-verification"');
    await route.fulfill({response,body:html});
  });
  await mac.goto(origin+'/submit.html',{waitUntil:'domcontentloaded'});
  const imageStatus=mac.locator('#turnstile-row [data-turnstile-status]');
  await imageStatus.waitFor();
  assert.match(await imageStatus.textContent(),/人机验证加载失败/);
  await mac.locator('#video-submission-tab').click();
  const videoStatus=mac.locator('#creator-turnstile-row [data-turnstile-status]');
  await videoStatus.waitFor();
  assert.match(await videoStatus.textContent(),/人机验证加载失败/);

  assert.deepEqual(errors,[]);
  console.log('Chromium audit passed: desktop and mobile, gallery filters, card controls, contrast, navigation, language and Turnstile.');
} finally {
  await browser.close();
}
