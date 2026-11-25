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
      const shown=Number(document.querySelector('#osint-total')?.textContent.replace(/[^0-9]/g,''));
      return total>0 && shown>0;
    },null,{timeout:55000});
  }catch(e){
    console.error('DIAGNOSTICS:',diag.join('\n')||'(none)');
    console.error('PAGE STATE:',await page.evaluate(()=>({
      title:document.title,lang:document.documentElement.lang,
      total:document.querySelector('#stat-total')?.textContent,
      shown:document.querySelector('#osint-total')?.textContent,
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
    filtered:Number(document.querySelector('#osint-total')?.textContent.replace(/[^0-9]/g,'')),
    rows:document.querySelectorAll('.event-item').length,
    lang:document.documentElement.lang,
    period:document.querySelector('#time-open')?.textContent,
    railVisible:!!document.querySelector('#osint-rail')?.getBoundingClientRect().height
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
  assert(mapState.diagnostics?.ibama?.dom?.domMarkers===0,'IBAMA records must not cover OSINT by default');
  assert(await page.locator('#osint-rail').isVisible(),'OSINT filters must be in the sidebar');
  assert(await page.locator('#event-feed').count()===0,'Legacy event list must be removed');
  const osintStyle=await page.locator('.ibama-html-pin').first().evaluate(el=>{const dot=getComputedStyle(el,'::after');return {width:dot.width,height:dot.height,outline:dot.boxShadow};});
  assert(osintStyle.width==='5px'&&osintStyle.height==='5px'&&osintStyle.outline.includes('0.5px')&&osintStyle.outline.includes('1.5px'),'OSINT must share official dot geometry');
  // A fresh visit starts with every optional layer unchecked.
  await page.locator('#layers-toggle').click();
  const osintCategoryCount=await page.locator('.crime-layer-toggle').count();
  assert(osintCategoryCount>0,'OSINT thematic categories were not rendered');
  assert(await page.locator('.crime-layer-toggle:checked').count()===osintCategoryCount,
    'All OSINT categories must start enabled independently of the official Nenhuma selection');
  assert(mapState.diagnostics?.osintMarkers?.pointsVisible===true,
    'OSINT event points must be visible on first load');
  assert(mapState.diagnostics?.htmlEventMarkers>0,
    'OSINT georeferenced event markers must render when opening the map');
  assert(await page.locator('.aux-layer-toggle:checked').count()===0,
    'Auxiliary layers must start unselected');
  assert(await page.locator('.mosaic-layer-toggle:checked').count()===0,
    'Mosaic layers must start unselected');
  await page.locator('#layers-close').click();
  await page.locator('#mode-official').click();
  await page.waitForFunction(()=>document.body.dataset.dataView==='official'&&!!document.querySelector('#official-rail:not([hidden])'));
  await page.waitForFunction(()=>window.__amazonMapHealth?.().ibama?.status==='ready',null,{timeout:30000});
  assert(await page.locator('#official-year').inputValue()==='2025','Only verified 2025 IBAMA year available');
  await page.waitForFunction(()=>window.__amazonMapHealth?.().ibama?.status==='ready'
    && window.__amazonMapHealth?.().ibama?.explorer?.visible>0,null,{timeout:30000});
  assert(await page.locator('.official-category-toggle:checked').count()===1,
    'Desmatamento must be the only initially selected official infraction category');
  assert(await page.locator('input.official-category-toggle[value="deforestation"]').isChecked(),
    'Desmatamento must be selected by default in official IBAMA');
  assert((await page.locator('#official-category-count').textContent()).trim()==='1',
    'Official selected category total must be one');
  await page.locator('#official-select-all').click();
  await page.waitForFunction(()=>Number((document.querySelector('#official-total')?.textContent||'').replace(/[^0-9]/g,''))>0);
  assert(await page.locator('#official-rail').isVisible(),'Official rail not visible');
  assert(!(await page.locator('#official-kde-toggle').isChecked()),
    'Hotspots must start disabled');
  assert(await page.locator('#official-kde-legend').isHidden(),
    'Hotspots legend should be hidden while disabled');
  assert(!(await page.locator('#osint-rail').isVisible()),'OSINT filter rail should be hidden in official mode');
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
  // Geospatial safety: low zoom currently uses only factual source
  // coordinates. Municipality averages must never be displayed as incidents.
  assert(ibamaHealth.dom.displayMode==='exact','Official IBAMA markers must use source coordinates at every zoom');
  assert(ibamaHealth.dom.cityMarkers===0,'Derived city centroids must not be rendered');
  const alignment=ibamaHealth.dom.alignment||[];
  console.log('IBAMA PIXEL ALIGNMENT:',JSON.stringify(alignment));
  assert(alignment.length>0,'No official markers available for spatial alignment check');
  for(const point of alignment){
    assert(Math.abs(point.dx)<=4 && Math.abs(point.dy)<=4,
      'Official marker shifted from its MapLibre-projected geographic location: '+
      JSON.stringify(point));
  }
  const coordinateInvariant=await page.evaluate(async()=>{
    const module=await import(new URL('./assets/js/ibama-2025-dom.js?v=20261124-geo-fix1',document.baseURI).href);
    const example=(lon,lat,city,uf)=>({type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},
      properties:{category:'mining',categories:['mining'],municipality:city,uf}});
    const exact=module.exactCoordinateGroups([example(-60,-3,'Manaus','AM'),
      example(-60.2,-3.1,'Manaus','AM'),example(-60,-3,'Manaus','AM')],new Set(['mining']));
    return {sites:exact.length,coordinates:exact.map(g=>[g.lon,g.lat]),total:exact.reduce((n,g)=>n+g.members.length,0)};
  });
  assert(coordinateInvariant.sites===2 && coordinateInvariant.total===3,
    'Distinct IBAMA source coordinates were lost');
  assert(coordinateInvariant.coordinates.some(c=>c[0]===-60&&c[1]===-3) &&
    coordinateInvariant.coordinates.some(c=>c[0]===-60.2&&c[1]===-3.1),
    'Official markers must retain source lon/lat precisely');
  const markerStyleAudit = await page.evaluate(() => {
    const pins = [...document.querySelectorAll('.ibama-html-pin')];
    const sample = [pins.find(el=>!el.classList.contains('ibama-city-group')), pins.find(el=>el.classList.contains('ibama-html-cluster')&&!el.classList.contains('ibama-city-group'))].filter(Boolean);
    return sample.map(el => {
      const style = getComputedStyle(el);
      const dot = getComputedStyle(el,'::after');
      return {outerWidth:parseFloat(style.width),outerHeight:parseFloat(style.height),
        border:style.borderTopWidth,boxShadow:style.boxShadow,
        dotWidth:parseFloat(dot.width),dotHeight:parseFloat(dot.height),
        dotColor:dot.backgroundColor,dotBorder:dot.borderTopWidth,dotOutline:dot.boxShadow,
        content:el.textContent.trim(),cluster:el.classList.contains('ibama-html-cluster')};
    });
  });
  console.log('IBAMA CATEGORY DOTS:',JSON.stringify(markerStyleAudit));
  assert(markerStyleAudit.length>0,'Cannot inspect official IBAMA marker design');
  assert(!(await page.locator('.official-results').isVisible()),'Official record list must be hidden from sidebar');
  for (const dot of markerStyleAudit) {
    assert(dot.border==='0px' && dot.dotBorder==='0px','Marker and core borders must be zero');
    assert(dot.dotOutline.includes('0.5px') && dot.dotOutline.includes('1.5px'),'White gap and black outline must be present on all IBAMA dots');
    if (dot.cluster) {
      assert(dot.outerWidth===12 && dot.outerHeight===12,'All official marker hit targets must be the same 12px size');
      assert(dot.dotWidth===5 && dot.dotHeight===5,'Grouped and single location dots must have the same 5px colour core');
      assert(dot.content==='','Exact-coordinate shared-site marker must not display record counts');
    } else {
      assert(dot.dotWidth<=6 && dot.dotHeight<=6,'Individual official dots must stay at 5px');
      assert(dot.content==='','Individual official map dots cannot display count badges');
      assert(dot.outerWidth===12 && dot.outerHeight===12,'Individual marker hit target must be 12px');
      assert(dot.boxShadow==='none','Individual dot container must have no halo');
    }
  }

  // Independent points toggle: hides official markers without changing filtered
  // record totals or the KDE source. Re-enable and verify identical marker size.
  const filteredTotalBefore=ibamaHealth.explorer.visible;
  const kdeBeforeToggle=await page.evaluate(()=>window.__amazonMapHealth?.().ibama?.kde);
  assert(await page.locator('#official-points-toggle').isChecked(),'Points should show initially');
  await page.locator('#official-points-toggle').uncheck();
  await page.waitForFunction(()=>window.__amazonMapHealth?.().ibama?.dom?.pointsVisible===false
    && document.querySelectorAll('.ibama-html-pin').length===0,null,{timeout:10000});
  const hiddenState=await page.evaluate(()=>window.__amazonMapHealth?.().ibama);
  assert(hiddenState.explorer.visible===filteredTotalBefore,'Hiding points changed filtered records');
  assert(hiddenState.kde.enabled===kdeBeforeToggle.enabled,'Hiding points changed Hotspots');
  await page.locator('#official-points-toggle').check();
  await page.waitForFunction(()=>window.__amazonMapHealth?.().ibama?.dom?.pointsVisible===true
    && document.querySelectorAll('.ibama-html-pin').length>0,null,{timeout:12000});
  const reopened=await page.locator('.ibama-html-pin').first().evaluate(el=>{
    const core=getComputedStyle(el,'::after');return {width:core.width,height:core.height};
  });
  assert(reopened.width==='5px'&&reopened.height==='5px','Point size changed after toggling visibility');

  // Hotspots remain disabled until explicitly selected.
  const offKde=await page.evaluate(()=>window.__amazonMapHealth?.().ibama?.kde);
  assert(offKde?.enabled===false && offKde?.visible===false,
    'KDE should not be active on initial load');
  await page.locator('#official-kde-toggle').check();
  // Hotspots are a separate count-weighted MapLibre heatmap; points stay unchanged.
  await page.waitForFunction(()=>window.__amazonMapHealth?.().ibama?.kde?.drawnRecords>0,null,{timeout:20000});
  const initialKde=await page.evaluate(()=>window.__amazonMapHealth?.().ibama?.kde);
  console.log('IBAMA HOTSPOTS INITIAL',JSON.stringify(initialKde));
  assert(initialKde.visible&&initialKde.layer,'Hotspots layer must be visible in official mode');
  assert(initialKde.drawnRecords===ibamaHealth.features,
         'KDE must weight every filtered official record, not one per coordinate');
  assert(initialKde.referenceCount===25,'KDE must retain a fixed event-count reference across filters');
  assert(initialKde.palette==='ibama-count-calibrated-v4'&&initialKde.scale==='absolute-per-kernel',
    'Hotspots intensity must be calibrated to stable raw record counts');
  const kdeCalibration=await page.evaluate(async()=>{
    const m=await import(new URL('./assets/js/ibama-kde.js?v=20261124-kde-calibrated1',document.baseURI).href);
    const point=(lon,lat)=>({type:'Feature',geometry:{type:'Point',coordinates:[lon,lat]},properties:{}});
    const lone=m.buildIbamaDensity([point(-60,-3)]);
    const inLargerSelection=m.buildIbamaDensity([point(-60,-3),point(-65,-5),point(-66,-6)]);
    const duplicates=m.buildIbamaDensity(Array.from({length:100},()=>point(-60,-3)));
    return {
      fixedWeight:m.KDE_PAINT['heatmap-weight'],
      intensity:m.KDE_PAINT['heatmap-intensity'],
      colorStops:m.KDE_PAINT['heatmap-color'],
      singleWeight:lone.collection.features[0].properties.event_count/m.KDE_REFERENCE_COUNT,
      singleWithOtherPoints:inLargerSelection.collection.features.find(f=>f.geometry.coordinates[0]===-60).properties.event_count/m.KDE_REFERENCE_COUNT,
      hundredWeight:duplicates.collection.features[0].properties.event_count/m.KDE_REFERENCE_COUNT,
      hundredRecords:duplicates.total,
      duplicateSites:duplicates.locations
    };
  });
  console.log('IBAMA KDE COUNT CALIBRATION',JSON.stringify(kdeCalibration));
  assert(kdeCalibration.intensity===1,'KDE intensity must not change with map zoom');
  assert(kdeCalibration.singleWeight===kdeCalibration.singleWithOtherPoints,
    'An isolated event changed weight when other filtered events were added');
  assert(kdeCalibration.singleWeight===1/25&&kdeCalibration.hundredWeight===4,
    'Hotspots must distinguish a singleton from 100 co-located notices');
  assert(kdeCalibration.hundredRecords===100&&kdeCalibration.duplicateSites===1,
    'Exact-coordinate duplicate notices lost their total count');
  assert(kdeCalibration.colorStops.includes('#e63832'),
    'Hotspots high-density red ramp is missing');
  assert(initialKde.drawnLocations===ibamaHealth.dom.selectedDistinctLocations,'KDE must preserve countable autos across identical coordinates');
  const actualHeatStyle=await page.evaluate(()=>{
    const map=window.__amazonMapHealth?.();
    return {gradient:document.querySelector('.official-kde-gradient')?.style?.background||null};
  });
  console.log('IBAMA WILDLIFE-STYLE HOTSPOTS',JSON.stringify(actualHeatStyle));

  assert(await page.locator('#official-kde-label').textContent()==='Hotspots','KDE button label must be Hotspots');
  const sizeBefore=await page.locator('.ibama-html-pin:not(.ibama-html-cluster)').first().evaluate(el=>{
    const dot=getComputedStyle(el,'::after');return [dot.width,dot.height];
  });
  await page.locator('#official-kde-toggle').uncheck();
  await page.waitForFunction(()=>window.__amazonMapHealth?.().ibama?.kde?.visible===false);
  await page.locator('#official-kde-toggle').check();
  await page.waitForFunction(()=>window.__amazonMapHealth?.().ibama?.kde?.visible===true);
  const sizeAfter=await page.locator('.ibama-html-pin:not(.ibama-html-cluster)').first().evaluate(el=>{
    const dot=getComputedStyle(el,'::after');return [dot.width,dot.height];
  });
  assert(JSON.stringify(sizeBefore)===JSON.stringify(sizeAfter),'Hotspots toggle changed point size');
  assert(ibamaHealth.enabled.length > 0, 'IBAMA thematic categories are all disabled');
  // The source retains every exact coordinate; city aggregation applies only to marker display at lower zoom.
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
    await page.waitForTimeout(550);
    const officialCardLayout=await page.evaluate(()=>{
      const card=document.querySelector('.ibama-official-popup');
      const area=document.querySelector('#map');
      if(!card||!area)return null;
      const box=card.getBoundingClientRect(), map=area.getBoundingClientRect();
      const view={left:Math.max(10,map.left+12),right:Math.min(window.innerWidth-10,map.right-12),
        top:Math.max(10,map.top+12),bottom:Math.min(window.innerHeight-10,map.bottom-12)};
      return {left:box.left-view.left,top:box.top-view.top,right:view.right-box.right,bottom:view.bottom-box.bottom,
        centerX:(box.left+box.right)/2-(view.left+view.right)/2,
        centerY:(box.top+box.bottom)/2-(view.top+view.bottom)/2,
        width:box.width,height:box.height,mapWidth:map.width,mapHeight:map.height,
        windowWidth:window.innerWidth,windowHeight:window.innerHeight,
        visibleWidth:view.right-view.left,visibleHeight:view.bottom-view.top,
        scrollTop:card.querySelector('.maplibregl-popup-content')?.scrollTop};
    });
    console.log('OFFICIAL POPUP FIT',JSON.stringify(officialCardLayout));
    assert(officialCardLayout && officialCardLayout.left>=-18 && officialCardLayout.top>=-18 &&
           officialCardLayout.right>=-18 && officialCardLayout.bottom>=-18,
           'Official popup must fit inside the visible non-fullscreen browser viewport');
    assert(Math.abs(officialCardLayout.centerX)<=30 && Math.abs(officialCardLayout.centerY)<=30,
           'Official popup must be centered in the visible map area, not only somewhere within the map');
    assert(officialCardLayout.scrollTop===0,
           'Official card must open at the beginning of its content');
    const detailTitle=await page.locator('.ibama-official-popup .ibama-popup>strong').first().textContent();
    assert(/Official Data|Dados Oficiais|Datos oficiales/.test(detailTitle||''),'Detail popup must use source-neutral title');
    await page.evaluate(()=>document.querySelector('.ibama-html-pin:not(.ibama-html-cluster)')?.click());
    await page.waitForTimeout(500);
    assert(await page.locator('.ibama-official-popup').count()===1,'Clicking a new event must close the previous official popup');
    // Reopen shared location and verify the list/back navigation.
    await first.evaluate(button=>button.click());
    await page.waitForFunction(()=>!!document.querySelector('.ibama-case-choice'),null,{timeout:7000});
    await page.locator('.ibama-case-choice').first().click({force:true});
    await page.waitForFunction(()=>!!document.querySelector('.ibama-choice-back'),null,{timeout:7000});
    await page.locator('.ibama-choice-back').click({force:true});
    assert(await page.locator('.ibama-case-choice').count()>1,
      'Return to exact-coordinate selection failed');
    await page.keyboard.press('Escape');
  }
  // Clicking a true source coordinate must zoom toward the incident, never a
  // municipality average. The focused card still starts at its heading.
  await page.evaluate(()=>{
    document.querySelector('.ibama-html-pin')?.click();
  });
  await page.waitForFunction(()=>window.__amazonMapHealth?.().zoom>=8.45,null,{timeout:8000});
  await page.waitForTimeout(550);
  const clicked=await page.evaluate(()=>({
    zoom:window.__amazonMapHealth?.().zoom,
    center:window.__amazonMapHealth?.().center,
    alignment:window.__amazonMapHealth?.().ibama?.dom?.alignment||[],
    popup:!!document.querySelector('.ibama-official-popup'),
    scrollTop:document.querySelector('.ibama-official-popup .maplibregl-popup-content')?.scrollTop
  }));
  console.log('IBAMA CLICK GEOLOCATION:',JSON.stringify(clicked));
  assert(clicked.popup,'Clicking an IBAMA point did not open a card');
  assert(clicked.scrollTop===0,'Official popup did not start at its heading');
  for(const marker of clicked.alignment){
    assert(Math.abs(marker.dx)<=4&&Math.abs(marker.dy)<=4,
      'Official point was displaced after zoom: '+JSON.stringify(marker));
  }
  await page.keyboard.press('Escape');
  // Official thematic filter, state filter and text search are applied to both
  // the map and the list through one selected-record collection.
  await page.locator('#official-select-none').click();
  await page.waitForFunction(()=>Number((document.querySelector('#official-total')?.textContent||'').replace(/[^0-9]/g,''))===0);
  await page.locator('input.official-category-toggle[value="mining"]').check();
  await page.waitForFunction(()=>Number((document.querySelector('#official-total')?.textContent||'').replace(/[^0-9]/g,''))>0);
  const filteredMining=await page.evaluate(()=>window.__amazonMapHealth?.().ibama?.explorer);
  console.log('OFFICIAL FILTERED MINING',JSON.stringify(filteredMining));
  await page.waitForFunction(()=>window.__amazonMapHealth?.().ibama?.kde?.drawnRecords===
    window.__amazonMapHealth?.().ibama?.explorer?.visible,null,{timeout:20000});
  const miningKde=await page.evaluate(()=>window.__amazonMapHealth?.().ibama?.kde);
  assert(miningKde.drawnRecords===filteredMining.visible,'Hotspots did not update to filtered mining record count');
  assert(miningKde.scale===initialKde.scale&&miningKde.referenceCount===initialKde.referenceCount,
    'Filtering changed the KDE absolute count calibration');
  assert(filteredMining.visible>0&&filteredMining.visible<ibamaHealth.features,'Mining filter failed');
  await page.locator('#official-state').selectOption('PA');
  await page.waitForFunction(()=>window.__amazonMapHealth?.().ibama?.explorer?.state==='PA');
  // Historical years are isolated from 2025 and loaded on demand without
  // mixing records or changing the canonical OSINT source.
  for(const year of ['2020','2024']){
    await page.locator('#official-year').selectOption(year);
    await page.waitForFunction(y=>window.__amazonMapHealth?.().ibama?.status==='ready'&&
      String(window.__amazonMapHealth?.().ibama?.year)===y&&
      window.__amazonMapHealth?.().ibama?.features>0,year,{timeout:35000});
    const annual=await page.evaluate(()=>window.__amazonMapHealth?.().ibama);
    console.log('IBAMA HISTORICAL YEAR',year,JSON.stringify({
      records:annual.features,year:annual.year,selected:annual.explorer.visible,
      status:annual.status
    }));
    assert(annual.year===Number(year)&&annual.features>0,
      'Historical IBAMA annual records unavailable '+year);
    assert(annual.explorer.year===year&&annual.explorer.visible>0,
      'Historical IBAMA filters are not applied to selected year '+year);
  }
  await page.locator('#official-year').selectOption('2025');
  await page.waitForFunction(()=>window.__amazonMapHealth?.().ibama?.year===2025&&
    window.__amazonMapHealth?.().ibama?.status==='ready',null,{timeout:35000});
  await page.locator('#official-reset').click();
  await page.waitForFunction(()=>window.__amazonMapHealth?.().ibama?.explorer?.state==='all'
    && window.__amazonMapHealth?.().ibama?.explorer?.visible>0);
  assert(await page.locator('.official-category-toggle:checked').count()===1,
    'Reset must select only Desmatamento');
  assert(await page.locator('input.official-category-toggle[value="deforestation"]').isChecked(),
    'Reset must restore Desmatamento as the official default');
  await page.locator('#mode-osint').click();
  await page.waitForFunction(()=>document.body.dataset.dataView==='osint');
  await page.waitForTimeout(300);
  assert(!(await page.locator('#official-rail').isVisible()),'Official panel must hide in OSINT mode');
  assert(mapState.diagnostics?.layer,'Map crime-events layer missing');
  assert(mapState.diagnostics?.source,'Map event GeoJSON source missing');
  // The OSINT selection survives visiting the IBAMA area and retains
  // the user's own independently configurable category filters.
  assert(mapState.diagnostics?.osintMarkers?.pointsVisible===true,'OSINT points must initially be visible');
  await page.locator('#layers-toggle').click();
  const actualOsintCategories=await page.locator('.crime-layer-toggle').count();
  assert(await page.locator('.crime-layer-toggle:checked').count()===actualOsintCategories,
    'The official Nenhuma preset must not clear the OSINT category selection');
  const firstCrime=page.locator('.crime-layer-toggle').first();
  await firstCrime.uncheck({force:true});
  assert(await page.locator('.crime-layer-toggle:checked').count()===actualOsintCategories-1,
    'OSINT categories must remain independently toggleable');
  await firstCrime.check({force:true});
  await page.waitForFunction(()=>window.__amazonMapHealth?.().osintMarkers?.pointsVisible===true,null,{timeout:10000});
  assert(await page.locator('.crime-layer-toggle:checked').count()===actualOsintCategories,
    'Reactivating the OSINT category must restore its selection');
  // Diagnose real geographical overlay controls and remote raster sources.
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
  assert(state.rows===0&&state.railVisible,'OSINT must show filters instead of the former event list');
  assert(state.lang==='en','English must be default in a new browser');
  await page.locator('#time-open').click();
  await page.locator('#time-preset').selectOption('all');
  await page.locator('button.time-apply').click();
  await page.waitForFunction(n=>Number(document.querySelector('#osint-total')?.textContent.replace(/[^0-9]/g,''))===n,publishedTotal);
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
