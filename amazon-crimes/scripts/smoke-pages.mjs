import process from 'node:process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');

const base = new URL(process.env.PAGE_URL || 'https://wcsbrintel.github.io/crimesamazonicos/');
const root = new URL(base.pathname.endsWith('/') ? base.pathname : base.pathname+'/',base);
const diag = [];
const tileResponses=[];
const tileFailures=[];
const isTerritoryUrl=url=>/uc-federal\.geojson|territory-tiles|geo2\.socioambiental\.org|geo\.anm\.gov\.br|territory-source/i.test(url);

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  args: ['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--use-gl=swiftshader']
});
const context = await browser.newContext({serviceWorkers:'block', viewport:{width:1440,height:900}});
const page = await context.newPage();
page.on('pageerror',e=>diag.push('PAGE ERROR: '+e.stack));
page.on('console',message=>{if(message.type()==='error')diag.push('CONSOLE: '+message.text())});
page.on('requestfailed',r=>{if(/\/(events\.json|app\.js|temporal-filter\.js|language-preference\.js)/.test(r.url()))diag.push('REQUEST: '+r.url()+' '+r.failure()?.errorText)});
page.on('requestfailed',r=>{if(isTerritoryUrl(r.url()))tileFailures.push({url:r.url().slice(0,260),error:r.failure()?.errorText})});
page.on('response',r=>{if(isTerritoryUrl(r.url()))tileResponses.push({status:r.status(),url:r.url().slice(0,310),contentType:r.headers()['content-type']||''})});
page.on('response',r=>{if(/\/(events\.json|app\.js|temporal-filter\.js|language-preference\.js)/.test(r.url()))console.log('RESOURCE',r.status(),r.url())});
const assert = (condition,message)=>{if(!condition)throw new Error(message)};
async function load(){
  await page.goto(root.toString()+'?smoke='+Date.now(), { waitUntil:'domcontentloaded',timeout:60000 });
  try {
    await page.waitForFunction(()=>{
      const total=Number(document.querySelector('#stat-total')?.textContent.replace(/[^0-9]/g,''));
      const shown=Number(document.querySelector('#feed-count')?.textContent.replace(/[^0-9]/g,''));
      return total>0 && shown>0;
    },null,{timeout:55000});
  }catch(e){
    console.error('DIAGNOSTICS:',diag.join('\n')||'(none)');
    console.error('PAGE STATE:',await page.evaluate(()=>({
      title:document.title,lang:document.documentElement.lang,
      total:document.querySelector('#stat-total')?.textContent,
      shown:document.querySelector('#feed-count')?.textContent,
      items:document.querySelectorAll('.event-item').length,
      message:document.querySelector('#event-feed')?.textContent?.slice(0,350),
      period:document.querySelector('#time-open')?.textContent
    })));
    throw e;
  }
}
try {
  await load();
  const state=await page.evaluate(()=>({
    total:Number(document.querySelector('#stat-total')?.textContent.replace(/[^0-9]/g,'')),
    filtered:Number(document.querySelector('#feed-count')?.textContent.replace(/[^0-9]/g,'')),
    rows:document.querySelectorAll('.event-item').length,
    lang:document.documentElement.lang,
    period:document.querySelector('#time-open')?.textContent,
    firstCardVisible:!!document.querySelector('.event-item')?.getBoundingClientRect().height
  }));
  console.log('DEFAULT:',JSON.stringify(state));
  await page.waitForTimeout(7000);
  const mapState=await page.evaluate(()=>({
    diagnostics:window.__amazonMapHealth?.(),
    mapUnavailable:document.querySelector('.map-unavailable')?.textContent?.slice(0,400),
    mapCanvas:!!document.querySelector('.maplibregl-canvas'),
    markerElements:document.querySelectorAll('.maplibregl-marker').length
  }));
  console.log('MAP HEALTH:',JSON.stringify(mapState));
  assert(mapState.diagnostics?.mapConstructed,'MapLibre map instance was not initialized');
  assert(mapState.diagnostics?.styleLoaded,'Map style did not load');
  // Explicit source selector: the default remains canonical OSINT and cannot be
  // contaminated by administrative records.
  assert(await page.locator('body').getAttribute('data-data-view')==='osint','Default mode must be OSINT');
  assert((await page.locator('.ibama-html-pin').count())===0,'IBAMA markers must not cover OSINT by default');
  await page.locator('#mode-official').click();
  await page.waitForFunction(()=>document.body.dataset.dataView==='official'&&!!document.querySelector('#official-rail:not([hidden])'));
  await page.waitForFunction(()=>Number((document.querySelector('#official-total')?.textContent||'').replace(/[^0-9]/g,''))>0);
  assert(await page.locator('#official-year').inputValue()==='2025','Only verified 2025 IBAMA year available');
  assert(await page.locator('#official-rail').isVisible(),'Official rail not visible');
  assert(!(await page.locator('#event-feed').isVisible()),'OSINT feed should be hidden in official mode');
  // Regression test: official 2025 IBAMA records must be visible, not merely counted.
  await page.waitForFunction(() => window.__amazonMapHealth?.().ibama?.status === 'ready', null, {timeout: 30000});
  await page.waitForFunction(() => document.querySelectorAll('.ibama-html-pin').length > 0, null, {timeout: 15000});
  const ibamaHealth = await page.evaluate(() => ({
    ...window.__amazonMapHealth?.().ibama,
    domNodes: document.querySelectorAll('.ibama-html-pin').length
  }));
  console.log('IBAMA 2025 VISIBLE POINTS:',JSON.stringify(ibamaHealth));
  assert(ibamaHealth.features > 0, 'IBAMA official source has no valid 2025 records');
  assert(ibamaHealth.domNodes > 0, 'IBAMA markers are not visible on the map');
  const markerStyleAudit = await page.evaluate(() => {
    const pins = [...document.querySelectorAll('.ibama-html-pin')];
    const sample = [pins[0], pins.find(el=>el.classList.contains('ibama-html-cluster'))].filter(Boolean);
    return sample.map(el => {
      const style = getComputedStyle(el);
      const dot = getComputedStyle(el,'::after');
      return {outerWidth:parseFloat(style.width),outerHeight:parseFloat(style.height),
        border:style.borderTopWidth,boxShadow:style.boxShadow,
        dotWidth:parseFloat(dot.width),dotHeight:parseFloat(dot.height),
        dotColor:dot.backgroundColor,dotBorder:dot.borderTopWidth,
        content:el.textContent.trim(),cluster:el.classList.contains('ibama-html-cluster')};
    });
  });
  console.log('IBAMA CATEGORY DOTS:',JSON.stringify(markerStyleAudit));
  assert(markerStyleAudit.length>0,'Cannot inspect official IBAMA marker design');
  assert(!(await page.locator('.official-results').isVisible()),'Official record list must be hidden from sidebar');
  for (const dot of markerStyleAudit) {
    assert(dot.border==='0px' && dot.dotBorder==='0px','IBAMA points must have no border');
    if (dot.cluster) {
      assert(dot.outerWidth>=20 && dot.outerWidth<=26,'Exact-coordinate group marker must be modest in size');
      assert(/^\\d+$/.test(dot.content),'Exact-coordinate group marker must show its record count');
    } else {
      assert(dot.dotWidth<=6 && dot.dotHeight<=6,'Individual official dots must stay at 5px');
      assert(dot.content==='','Individual official map dots cannot display count badges');
      assert(dot.boxShadow==='none','Individual official dots cannot have halos');
    }
  }

  assert(ibamaHealth.enabled.length > 0, 'IBAMA thematic categories are all disabled');
  // Every DOM marker corresponds to one exact numeric coordinate pair.
  // No pixel-binning, zoom clusters or skipped groups.
  const exactLocationAudit = await page.evaluate(async () => {
    const response = await fetch(new URL('./data/ibama-2025.json', document.baseURI), {cache:'no-store'});
    if (!response.ok) throw new Error('IBAMA source unavailable: HTTP ' + response.status);
    const dataset = await response.json();
    const all = dataset.features.filter(f => f.geometry?.type === 'Point' && f.properties?.date?.startsWith('2025-'));
    const sites = new Map();
    for (const f of all) {
      const key = Number(f.geometry.coordinates[0]) + ',' + Number(f.geometry.coordinates[1]);
      sites.set(key, (sites.get(key)||0)+1);
    }
    return {
      records: all.length,
      distinctLocations: sites.size,
      coincidentLocations: [...sites.values()].filter(n=>n>1).length,
      exactMarkerModuleLoaded: !!document.querySelector('.ibama-html-pin'),
      markersWithMultipleRecords: document.querySelectorAll('.ibama-html-pin.ibama-html-cluster').length
    };
  });
  console.log('IBAMA EXACT-LOCATION AUDIT:', JSON.stringify(exactLocationAudit));
  assert(exactLocationAudit.records===ibamaHealth.features,'IBAMA audit record count differs');
  // Official textual fields must stay attached to their authentic source record.
  const narrativeAudit=await page.evaluate(async()=>{
    const data=await (await fetch(new URL('./data/ibama-2025.json',document.baseURI),{cache:'no-store'})).json();
    return {autosWithDetail:data.features.filter(f=>f.properties?.official?.narrative_detail).length,
      termsWithDetail:data.features.flatMap(f=>f.properties?.seizure_terms||[]).filter(t=>t.seizure_detail).length};
  });
  console.log('IBAMA OFFICIAL NARRATIVES',JSON.stringify(narrativeAudit));
  assert(narrativeAudit.autosWithDetail>0,'DES_AUTO_INFRACAO missing from official cards');
  assert(narrativeAudit.termsWithDetail>0,'DS_TAD missing from linked seizure terms');
  assert(exactLocationAudit.distinctLocations > 0, 'No distinct exact coordinates loaded');
  assert(ibamaHealth.dom.selectedDistinctLocations === exactLocationAudit.distinctLocations,
         'Some IBAMA distinct coordinates were merged or omitted');
  assert(ibamaHealth.dom.domMarkers > 0, 'No exact-location pins in viewport');
  if (exactLocationAudit.markersWithMultipleRecords) {
    const first = page.locator('.ibama-html-pin.ibama-html-cluster').first();
    await first.evaluate(button => button.click()); // Exact-coordinate markers overlap in dense areas: dispatch to the selected marker
    await page.waitForFunction(()=>!!document.querySelector('.ibama-case-choice'),null,{timeout:7000});
    const choices = await page.locator('.ibama-case-choice').count();
    const groupTitle = await page.locator('.ibama-official-popup strong').first().textContent();
    assert(/Official Data|Dados Oficiais|Datos oficiales/.test(groupTitle||''),'Group popup must use source-neutral official title');
    assert(choices>1,'Coincident-location pin does not show selectable records');
    await page.locator('.ibama-case-choice').first().click({force:true});
    assert(await page.locator('.ibama-choice-back').count()===1,
      'Individual IBAMA record did not open from the exact-coordinate list');
    const detailTitle=await page.locator('.ibama-official-popup .ibama-popup>strong').first().textContent();
    assert(/Official Data|Dados Oficiais|Datos oficiales/.test(detailTitle||''),'Detail popup must use source-neutral title');
    await page.evaluate(()=>document.querySelector('.ibama-html-pin:not(.ibama-html-cluster)')?.click());
    await page.waitForTimeout(500);
    assert(await page.locator('.ibama-official-popup').count()===1,'Clicking a new event must close the previous official popup');
    // Reopen shared location and verify the list/back navigation.
    await first.evaluate(button=>button.click());
    await page.waitForFunction(()=>!!document.querySelector('.ibama-case-choice'),null,{timeout:7000});
    await page.locator('.ibama-choice-back').click({force:true});
    assert(await page.locator('.ibama-case-choice').count()>1,
      'Return to exact-coordinate selection failed');
    await page.keyboard.press('Escape');
  }
  // Official thematic filter, state filter and text search are applied to both
  // the map and the list through one selected-record collection.
  await page.locator('#official-select-none').click();
  await page.waitForFunction(()=>Number((document.querySelector('#official-total')?.textContent||'').replace(/[^0-9]/g,''))===0);
  await page.locator('input.official-category-toggle[value="mining"]').check();
  await page.waitForFunction(()=>Number((document.querySelector('#official-total')?.textContent||'').replace(/[^0-9]/g,''))>0);
  const filteredMining=await page.evaluate(()=>window.__amazonMapHealth?.().ibama?.explorer);
  console.log('OFFICIAL FILTERED MINING',JSON.stringify(filteredMining));
  assert(filteredMining.visible>0&&filteredMining.visible<ibamaHealth.features,'Mining filter failed');
  await page.locator('#official-state').selectOption('PA');
  await page.waitForFunction(()=>window.__amazonMapHealth?.().ibama?.explorer?.state==='PA');
  await page.locator('#official-reset').click();
  await page.locator('#mode-osint').click();
  await page.waitForFunction(()=>document.body.dataset.dataView==='osint');
  await page.waitForTimeout(300);
  assert(!(await page.locator('#official-rail').isVisible()),'Official panel must hide in OSINT mode');
  assert(mapState.diagnostics?.layer,'Map crime-events layer missing');
  assert(mapState.diagnostics?.source,'Map event GeoJSON source missing');
  assert(mapState.diagnostics?.rendered>0,'Crime-event circles not visibly rendered on the map');
  // Diagnose real geographical overlay controls and remote raster sources.
  await page.locator('#layers-toggle').click();
  const territoryControlNames=await page.locator('input.aux-layer-toggle').evaluateAll(items=>items.map(i=>i.value));
  console.log('OVERLAY_CONTROLS',JSON.stringify(territoryControlNames));
  for(const key of ['protected_areas','brazil_conservation_units','indigenous_lands','strict_protection','sustainable_use']){
    const loc=page.locator('input.aux-layer-toggle[value="'+key+'"]');
    console.log('OVERLAY_UI',key,await loc.count());
    if(await loc.count())await loc.evaluate(el=>{if(!el.checked){el.checked=true;el.dispatchEvent(new Event('change',{bubbles:true}));}});
  }
  await page.waitForTimeout(12000);
  console.log('OVERLAY_RESPONSE_SUMMARY',JSON.stringify(tileResponses.slice(0,40)));
  console.log('OVERLAY_FAILURES',JSON.stringify(tileFailures.slice(0,30)));
  console.log('OVERLAY_DIAG',JSON.stringify(diag.slice(-35)));
  const overlays=await page.evaluate(()=>window.__amazonMapHealth?.().territorial);
  console.log('OVERLAY_FULL_STATE',JSON.stringify(overlays));
  const selected=['protected_areas','brazil_conservation_units','indigenous_lands','strict_protection','sustainable_use'];
  for(const id of selected){
    const item=overlays?.find(x=>x.id===id);
    assert(item?.layer&&item?.source&&item?.visibility==='visible',id+' not visible');
  }
  // Verify that the actual Indigenous Territories PNG has non-transparent pixels.
  // HTTP 200 and "visible" MapLibre layout properties alone do not prove geography is drawn.
  const pixelTest=await page.evaluate(async()=>{
    const url=new URL('./assets/territory-tiles/indigenous_lands/5/10/16.png',document.baseURI);
    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw new Error('Indigenous reference PNG HTTP '+response.status);
    const bitmap=await createImageBitmap(await response.blob());
    const canvas=document.createElement('canvas');
    canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(bitmap,0,0);
    const data=ctx.getImageData(0,0,bitmap.width,bitmap.height).data;
    let opaque=0;
    for(let i=3;i<data.length;i+=4)if(data[i]>20)opaque++;
    return {opaque,width:bitmap.width,height:bitmap.height};
  });
  console.log('INDIGENOUS_PIXEL_TEST',JSON.stringify(pixelTest));
  assert(pixelTest.opaque>100,'Indigenous territories WMS image is blank/transparent');
  const localOk=tileResponses.filter(r=>r.url.includes('/assets/territory-tiles/') && r.status===200&&r.contentType.includes('image/'));
  assert(localOk.length>0,'No locally hosted GIS imagery successfully loaded');
  assert(!tileResponses.some(r=>r.url.includes('/assets/territory-tiles/')&&r.status>=400),'Territory raster tile HTTP error');
  assert(!tileFailures.some(r=>r.url.includes('/assets/territory-tiles/')),'Territory raster requests failed');
  console.log('OVERLAY_AFTER_TOGGLE',JSON.stringify(await page.evaluate(()=>({
    active:[...document.querySelectorAll('input.aux-layer-toggle:checked')].map(x=>x.value),
    map:window.__amazonMapHealth?.()
  }))));

  const publishedTotal=await page.evaluate(async()=>{
    const response=await fetch(new URL('./data/events.json',document.baseURI),{cache:'no-store'});
    if(!response.ok)throw new Error('Published events.json HTTP '+response.status);
    const payload=await response.json();
    return Array.isArray(payload.events)?payload.events.length:0;
  });
  assert(publishedTotal>=176,'Expected at least 176 eligible records in public dataset, got '+publishedTotal);
  assert(state.total===publishedTotal,'Dashboard total '+state.total+' differs from published dataset '+publishedTotal);
  assert(state.filtered>0,'Default 12-month filter has no visible events');
  assert(state.rows>0&&state.firstCardVisible,'Event feed cards are not rendered visibly');
  assert(state.lang==='en','English must be default in a new browser');
  await page.locator('#time-open').click();
  await page.locator('#time-preset').selectOption('all');
  await page.locator('button.time-apply').click();
  await page.waitForFunction(n=>Number(document.querySelector('#feed-count')?.textContent.replace(/[^0-9]/g,''))===n,publishedTotal);
  console.log('ALL TIME: '+publishedTotal+' events displayed in count');
  await page.locator('button[data-lang="pt"]').first().click();
  assert(await page.locator('html').getAttribute('lang')==='pt-BR','Switch to PT failed in main view');
  await page.goto(new URL('news.html',root).toString(),{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.lang==='pt-BR');
  assert(await page.locator('button[data-lang="pt"]').first().getAttribute('aria-pressed')==='true','PT not selected in news');
  await page.goto(new URL('how-it-works.html?lang=en',root).toString(),{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.lang==='pt-BR');
  console.log('CROSS-PAGE: PT persisted across news and stale ?lang=en link');
  console.log('SMOKE PASSED');
} catch (error) {
  console.error('SMOKE FAILED:',error.stack||error);
  console.error('BROWSER DIAGNOSTICS:',diag.join('\n')||'(none)');
  process.exitCode=1;
}finally{await browser.close()}
