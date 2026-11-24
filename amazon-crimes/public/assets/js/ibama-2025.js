// Independent 2025 IBAMA administrative layer. Does not modify canonical OSINT events.
import { createIbamaDomOverlay } from './ibama-2025-dom.js?v=20261124-city1';
import { createOfficialExplorer } from './official-explorer.js?v=20261124-city1';
import { createIbamaKde } from './ibama-kde.js?v=20261124-exact-kde1';
const TYPES = [
  ['deforestation','#da7048',{pt:'Desmatamento',en:'Deforestation',es:'Deforestación'}],
  ['logging','#aa814b',{pt:'Madeira e exploração florestal',en:'Logging and forest products',es:'Madera y explotación forestal'}],
  ['flora_other','#7dba72',{pt:'Outras infrações à flora',en:'Other flora infractions',es:'Otras infracciones a la flora'}],
  ['wildlife','#56a989',{pt:'Fauna silvestre',en:'Wildlife',es:'Fauna silvestre'}],
  ['fishing','#4cace0',{pt:'Pesca',en:'Fishing',es:'Pesca'}],
  ['mining','#d7b14b',{pt:'Mineração e garimpo',en:'Mining',es:'Minería'}],
  ['pollution','#9584d0',{pt:'Poluição',en:'Pollution',es:'Contaminación'}],
  ['fire','#df824d',{pt:'Fogo e queimadas',en:'Fire',es:'Incendios'}],
  ['other','#8e9b9c',{pt:'Outras infrações ambientais',en:'Other infractions',es:'Otras infracciones'}]
];
const copy = {
 pt:{heading:'IBAMA · 2025',note:'Autos de infração oficiais. Registros administrativos, não condenações criminais. Recorte: UFs da Amazônia Legal; não equivale ao limite do bioma.',loading:'Carregando registros oficiais de 2025…',missing:'Carga oficial de 2025 indisponível',on:'Selecionar todas',off:'Desmarcar',source:'Fonte oficial',date:'Data da autuação',status:'Auto de infração (administrativo)',count:'pontos'},
 en:{heading:'IBAMA · 2025',note:'Official environmental violation notices; administrative records, not criminal convictions. Legal Amazon states, not Amazon biome boundary.',loading:'Loading official 2025 records…',missing:'Official 2025 snapshot unavailable',on:'Select all',off:'Deselect',source:'Official source',date:'Notice date',status:'Environmental violation notice (administrative)',count:'points'},
 es:{heading:'IBAMA · 2025',note:'Actas oficiales de infracción; registros administrativos, no condenas penales. Estados de la Amazonía Legal, no límite del bioma.',loading:'Cargando registros oficiales de 2025…',missing:'Carga oficial de 2025 no disponible',on:'Seleccionar todas',off:'Deseleccionar',source:'Fuente oficial',date:'Fecha del acta',status:'Acta administrativa',count:'puntos'}
};
const id = 'ibama-official-2025', source = 'ibama-2025-source';
const enabled = new Set();
let map, lib, getLanguage, features=[], loadState='loading', snapshotStats={};
let domOverlay = null;
let kdeOverlay = null;
let officialExplorer = null;
let officialMode = false;
const emptyEnabled = new Set();
let activeOfficialPopup = null;
const lang=()=>copy[getLanguage?.()] ? getLanguage() : 'en';
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fc=()=>({type:'FeatureCollection',features});
function render(){
 const panel=document.getElementById('ibama-layer-section'); if(!panel)return;
 const tr=copy[lang()];
 const counts=Object.fromEntries(TYPES.map(([id])=>[id,0]));
 for(const f of features){for(const c of (f.properties?.categories||[f.properties?.category]))if(c in counts)counts[c]++;}
 panel.innerHTML='<div class="layer-section-title"><span>'+html(tr.heading)+'</span><small class="ibama-count">'+features.length.toLocaleString(lang())+' '+html(tr.count)+'</small></div>'+
 '<p class="ibama-note">'+html(tr.note)+'</p>'+
 '<div class="ibama-actions"><button type="button" id="ibama-all">'+html(tr.on)+'</button><button type="button" id="ibama-none">'+html(tr.off)+'</button></div>'+
 '<div class="layer-list">'+TYPES.map(([key,color,labels])=>'<label class="layer-row"><input class="ibama-category" type="checkbox" value="'+key+'" '+(enabled.has(key)?'checked':'')+' '+(features.length?'':'disabled')+'><span class="layer-dot-marker" style="--swatch:'+color+'"></span><span>'+html(labels[lang()])+' <small>('+counts[key].toLocaleString(lang())+')</small></span></label>').join('')+'</div>'+
 '<div class="ibama-source-state">'+(loadState==='ready'?html(tr.status):loadState==='loading'?html(tr.loading):html(tr.missing))+' · <a href="https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao" target="_blank" rel="noopener noreferrer">IBAMA</a></div>';
 panel.querySelectorAll('.ibama-category').forEach(e=>e.addEventListener('change',()=>{if(e.checked)enabled.add(e.value);else enabled.delete(e.value);updateVisibility();}));
 panel.querySelector('#ibama-all').addEventListener('click',()=>{TYPES.forEach(t=>enabled.add(t[0]));render();updateVisibility();});
 panel.querySelector('#ibama-none').addEventListener('click',()=>{enabled.clear();render();updateVisibility();});
}
// All official points are native map markers with exact-coordinate selection.
// Avoid duplicating thousands of enriched records in a hidden MapLibre GeoJSON
// source on every text-filter change: that stalls the map and is unnecessary.
function install(){ domOverlay?.schedule(); }
function updateVisibility(){
 domOverlay?.schedule();
 kdeOverlay?.setSelected(officialMode && officialExplorer ? officialExplorer.selected() : []);
}
function recordDetails(props) {
 const tr=copy[lang()];
 const extra=props.official||{};
 const texts={
  pt:{description:'Descrição oficial da infração',legal:'Enquadramento administrativo',nonAdmin:'Outro enquadramento legal',additional:'Enquadramento complementar',area:'Área afetada',biome:'Biomas atingidos',protected:'Unidade de conservação',operation:'Operação',process:'Processo',fine:'Valor do auto (R$)',factDate:'Data do fato declarado',species:'Espécimes identificados no auto (não necessariamente apreendidos)',seizedSpecies:'Espécimes apreendidos — termo vinculado',seizedGoods:'Bens apreendidos — termo vinculado',terms:'Termos de apreensão vinculados',notReported:'Não informado',multiple:'Categorias temáticas',notice:'Auto de infração',units:'Unidade'},
  en:{description:'Official infraction description',legal:'Administrative legal basis',nonAdmin:'Other legal basis',additional:'Complementary legal basis',area:'Affected area',biome:'Affected biomes',protected:'Protected area',operation:'Operation',process:'Case file',fine:'Notice amount (BRL)',factDate:'Reported event date',species:'Species recorded in notice (not necessarily seized)',seizedSpecies:'Seized specimens — officially linked term',seizedGoods:'Seized goods — officially linked term',terms:'Linked seizure terms',notReported:'Not reported',multiple:'Thematic categories',notice:'Inspection notice',units:'Unit'},
  es:{description:'Descripción oficial de la infracción',legal:'Fundamento administrativo',nonAdmin:'Otro fundamento legal',additional:'Fundamento complementario',area:'Área afectada',biome:'Biomas afectados',protected:'Área protegida',operation:'Operación',process:'Expediente',fine:'Importe del acta (BRL)',factDate:'Fecha del hecho declarado',species:'Especies identificadas en el acta (no necesariamente incautadas)',seizedSpecies:'Especímenes incautados — acta vinculada',seizedGoods:'Bienes incautados — acta vinculada',terms:'Actas de incautación vinculadas',notReported:'No informado',multiple:'Categorías temáticas',notice:'Acta de infracción',units:'Unidad'}
 };
 const l=texts[lang()];
 const formatNum=n=>(n===null||n===undefined)?'':Number(n).toLocaleString(lang()==='pt'?'pt-BR':lang()==='es'?'es-ES':'en-US',{maximumFractionDigits:4});
 const fields=[
  [tr.date,props.date],['UF',props.uf],
  ['Município / Municipality',props.municipality],[l.notice,props.notice],
  ['Tipo / Type',props.type],[l.description,extra.infraction_description],
  [l.legal,extra.administrative_legal_basis],[l.nonAdmin,extra.non_administrative_legal_basis],
  [l.additional,extra.additional_legal_basis],[l.biome,extra.biomes],
  [l.protected,extra.protected_area],[l.operation,extra.operation],
  [l.process,extra.process],[l.factDate,extra.fact_date],
  [l.area,extra.affected_area===null||extra.affected_area===undefined?'':formatNum(extra.affected_area)+' '+(extra.affected_area_unit||'')],
  [l.fine,extra.fine_brl===null||extra.fine_brl===undefined?'':formatNum(extra.fine_brl)],
  [l.multiple,(props.categories||[props.category]).map(c=>TYPES.find(t=>t[0]===c)?.[2]?.[lang()]||c).join(', ')]
 ];
 const body=fields.filter(([,v])=>v!==null&&v!==undefined&&String(v).trim()).map(([k,v])=>'<div class="ibama-detail-row"><strong>'+html(k)+':</strong> <span>'+html(v)+'</span></div>').join('');
 const narrative=extra.narrative_detail
  ? '<section class="ibama-record-section ibama-narrative"><h4>'+html(({pt:'Detalhamento',en:'Details',es:'Detalle'})[lang()])+'</h4><p>'+html(extra.narrative_detail)+'</p><small>IBAMA · DES_AUTO_INFRACAO</small></section>' : '';
 const biological=(title,items)=>items?.length?'<section class="ibama-record-section"><h4>'+html(title)+' ('+items.length+')</h4><ul>'+
  items.map(item=>'<li><strong class="ibama-taxon">'+html(item.scientific_name||item.common_name||'—')+'</strong>'+
  (item.common_name&&item.scientific_name?' — '+html(item.common_name):'')+
  (item.quantity!==null&&item.quantity!==undefined?' · '+html(formatNum(item.quantity))+' '+html(item.unit||''):'')+
  (item.group?' · '+html(item.group):'')+
  (item.term_id?' · TAD '+html(item.term_id):'')+'</li>').join('')+'</ul></section>':'';
 const goods=props.seized_goods?.length?'<section class="ibama-record-section"><h4>'+html(l.seizedGoods)+' ('+props.seized_goods.length+')</h4><ul>'+
  props.seized_goods.map(item=>'<li><strong>'+html(item.name||item.kind||'—')+'</strong>'+
  (item.quantity!==null&&item.quantity!==undefined?' · '+html(formatNum(item.quantity))+' '+html(item.unit||''):'')+
  (item.term_id?' · TAD '+html(item.term_id):'')+'</li>').join('')+'</ul></section>':'';
 const terms=props.seizure_terms?.length?'<section class="ibama-record-section"><h4>'+html(l.terms)+'</h4><ul>'+
  props.seizure_terms.map(item=>'<li><strong>'+html([item.number,item.series,item.date].filter(Boolean).join(' · ')||item.id)+'</strong>'+
   (item.seizure_detail?'<div class="ibama-tad-detail"><strong>'+html(({pt:'Detalhamento da apreensão',en:'Seizure details',es:'Detalle de la incautación'})[lang()])+'</strong><p>'+html(item.seizure_detail)+'</p><small>IBAMA · DS_TAD</small></div>':'')+'</li>').join('')+'</ul></section>':'';
 return '<strong>'+html(({pt:'Dados Oficiais',en:'Official Data',es:'Datos oficiales'})[lang()])+'</strong><p>'+html(tr.status)+' · IBAMA · 2025</p>'+body+narrative+
  biological(l.species,props.species_referenced)+biological(l.seizedSpecies,props.seized_specimens)+goods+terms+
  '<p><a href="https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao" target="_blank" rel="noopener noreferrer">'+html(tr.source)+'</a></p>';
}
function closeOfficialPopup(){
 if(activeOfficialPopup){
   const previous=activeOfficialPopup;
   activeOfficialPopup=null;
   previous.remove();
 }
}
function fitOfficialPopup(popupView) {
 // Use the actual map viewport rather than the browser viewport; the
 // map shares horizontal space with the filters sidebar.
 if(!popupView?.getElement?.()) return;
 const mapEl=map.getContainer();
 const content=popupView.getElement()?.querySelector('.maplibregl-popup-content');
 const area=mapEl.getBoundingClientRect();
 if(!content || !area.width || !area.height) return;
 const availableHeight=Math.max(155,Math.min(420,area.height-58));
 content.style.maxHeight=availableHeight+'px';
 content.style.overflowY='auto';
 // Every newly opened case or case-selection view starts at its header.
 // Only the reader can scroll down afterwards.
 content.scrollTop=0;
 const inner=content.querySelector('.ibama-detailed, .ibama-choices');
 if(inner)inner.scrollTop=0;
 // MapLibre may choose a different anchor after setHTML. Recheck only
 // after layout is complete and shift the camera if the card is clipped.
 const reposition=()=>{
   if(activeOfficialPopup!==popupView || !popupView.getElement()?.isConnected)return;
   const popupRect=popupView.getElement().getBoundingClientRect();
   const region=mapEl.getBoundingClientRect();
   const margin=14;
   let shiftX=0,shiftY=0;
   if(popupRect.left<region.left+margin)shiftX=region.left+margin-popupRect.left;
   else if(popupRect.right>region.right-margin)shiftX=region.right-margin-popupRect.right;
   if(popupRect.top<region.top+margin)shiftY=region.top+margin-popupRect.top;
   else if(popupRect.bottom>region.bottom-margin)shiftY=region.bottom-margin-popupRect.bottom;
   if(Math.abs(shiftX)>1||Math.abs(shiftY)>1){
     // Camera offset has the opposite sign to the desired screen translation.
     map.panBy([-shiftX,-shiftY],{duration:250});
   }
 };
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
   const current=popupView.getElement()?.querySelector('.maplibregl-popup-content');
   if(current && activeOfficialPopup===popupView)current.scrollTop=0;
   reposition();
 }));
}
function createOfficialPopup(location,maxWidth='450px'){
 closeOfficialPopup();
 const pop=new lib.Popup({
   closeButton:true,closeOnClick:false,
   maxWidth,offset:12,className:'ibama-official-popup'
 }).setLngLat(location).addTo(map);
 activeOfficialPopup=pop;
 pop.on('close',()=>{if(activeOfficialPopup===pop)activeOfficialPopup=null;});
 return pop;
}
function popup(props,location){
 const view=createOfficialPopup(location);
 view.setHTML('<div class="ibama-popup ibama-detailed">'+recordDetails(props)+'</div>');
 fitOfficialPopup(view);
}

function groupPopup(group, location){
 const tr=copy[lang()];
 const categories=[...new Set(group.members.flatMap(f=>f.properties?.categories||[f.properties?.category]))];
 const label=categories.map(cat=>TYPES.find(t=>t[0]===cat)?.[2]?.[lang()]||cat).join(' · ');
 const fmt=new Intl.NumberFormat(lang()==='pt'?'pt-BR':lang()==='es'?'es-ES':'en-US');

 const records=group.members.slice().sort((a,b)=>String(b.properties?.date||'').localeCompare(String(a.properties?.date||''))||String(a.properties?.id||'').localeCompare(String(b.properties?.id||'')));
 const popupView=createOfficialPopup(location,'430px');
 const renderPage=(page=0,search='')=>{
  const filter=search.trim().toLocaleLowerCase();
  const matches=records.filter(f=>{
    const p=f.properties||{};
    return !filter||[p.notice,p.date,p.municipality,p.uf,p.type,p.category,p.id].some(v=>String(v||'').toLocaleLowerCase().includes(filter));
  });
  const pageSize=20,totalPages=Math.max(1,Math.ceil(matches.length/pageSize));
  const current=Math.max(0,Math.min(page,totalPages-1));
  const buttons=matches.slice(current*pageSize,(current+1)*pageSize).map((f,i)=>{
    const p=f.properties||{};
    return '<button type="button" class="ibama-case-choice" data-choice="'+(current*pageSize+i)+'"><strong>'+html(p.notice||p.id||'IBAMA')+'</strong><small>'+html([p.date,p.municipality,p.uf,p.type].filter(Boolean).join(' · '))+'</small></button>';
  }).join('');
  const citySummary=group.kind==='city'&&group.municipality ? group.municipality+' · '+group.uf : '';
  const groupingHint=group.kind==='city'
    ? ({pt:'Autos agrupados pelo município e UF informados pelo IBAMA. O marcador representa a média das coordenadas dos registros, não a sede municipal.',en:'Notices grouped by IBAMA municipality and state. The marker uses the mean recorded coordinates, not the municipal centre.',es:'Actas agrupadas por municipio y estado del IBAMA. El marcador utiliza el promedio de coordenadas, no el centro municipal.'})[lang()]
    : ({pt:'Registros nas mesmas coordenadas geográficas (sem agrupamento por proximidade). Selecione um auto para visualizar.',en:'Records at identical geographic coordinates (no proximity clustering). Select a notice to view.',es:'Registros con coordenadas geográficas idénticas (sin agrupación por proximidad). Seleccione un acta para visualizar.'})[lang()];
  popupView.setHTML('<div class="ibama-popup ibama-choices"><strong>'+html(({pt:'Dados Oficiais',en:'Official Data',es:'Datos oficiales'})[lang()])+'</strong><p>'+html(citySummary||tr.status)+' · IBAMA · 2025 · '+fmt.format(matches.length)+' / '+fmt.format(records.length)+' '+html(tr.count)+'</p><p class="ibama-exact-note">'+html(groupingHint)+'</p><input class="ibama-choice-search" type="search" placeholder="'+html(({pt:'Buscar por auto, data, local ou tipo',en:'Search by notice, date, place or type',es:'Buscar por acta, fecha, lugar o tipo'})[lang()])+'" value="'+html(search)+'" aria-label="Search IBAMA notices"><div class="ibama-choice-list">'+(buttons||'<p>—</p>')+'</div><div class="ibama-choice-pager"><button type="button" data-page="previous" '+(current===0?'disabled':'')+'>←</button><span>'+(current+1)+' / '+totalPages+'</span><button type="button" data-page="next" '+(current>=totalPages-1?'disabled':'')+'>→</button></div></div>');
  fitOfficialPopup(popupView);
  const root=popupView.getElement();
  root.querySelector('.ibama-choice-search')?.addEventListener('input',e=>{
    const value=e.target.value;
    renderPage(0,value);
    const input=popupView.getElement()?.querySelector('.ibama-choice-search');
    input?.focus();input?.setSelectionRange(value.length,value.length);
  });
  root.querySelectorAll('.ibama-case-choice').forEach(button=>button.addEventListener('click',()=>{
    const item=matches[Number(button.dataset.choice)];
    if(!item)return;
    const p=item.properties;
    const backLabel=({pt:'← Voltar à lista',en:'← Back to list',es:'← Volver a la lista'})[lang()];

    if(group.kind==='city'){
      const [lon,lat]=item.geometry.coordinates;
      popupView.setLngLat([lon,lat]);
      map.easeTo({center:[lon,lat],zoom:Math.max(7.2,map.getZoom()),duration:450});
    }
    popupView.setHTML('<div class="ibama-popup ibama-detailed"><button type="button" class="ibama-choice-back">'+html(backLabel)+'</button>'+recordDetails(p)+'</div>');
    fitOfficialPopup(popupView);
    popupView.getElement().querySelector('.ibama-choice-back').addEventListener('click',()=>{
       if(group.kind==='city')popupView.setLngLat(location);
       renderPage(current,search);
    });
  }));
  root.querySelector('[data-page="previous"]')?.addEventListener('click',()=>renderPage(current-1,search));
  root.querySelector('[data-page="next"]')?.addEventListener('click',()=>renderPage(current+1,search));
 };
 renderPage();
}
export function installIbama2025(theMap,theLibrary,languageGetter){
 map=theMap;lib=theLibrary;getLanguage=languageGetter;
 officialExplorer=createOfficialExplorer({
  getLanguage:()=>lang(),
  onChange:()=>updateVisibility(),
  onSelectRecord:(feature)=>{
    if(!feature?.geometry?.coordinates)return;
    const [lon,lat]=feature.geometry.coordinates;
    map.easeTo({center:[lon,lat],zoom:Math.max(6.3,map.getZoom()),duration:450});
    popup(feature.properties,{lng:lon,lat});
  }
 });
 officialExplorer.init();
 kdeOverlay=createIbamaKde({map});
 kdeOverlay.init();
 const densityToggle=document.getElementById('official-kde-toggle');
 densityToggle?.addEventListener('change',()=>{
   kdeOverlay?.setEnabled(Boolean(densityToggle.checked));
   const legend=document.getElementById('official-kde-legend');
   if(legend) legend.hidden=!densityToggle.checked;
 });
 kdeOverlay.setEnabled(Boolean(densityToggle?.checked));
 domOverlay=createIbamaDomOverlay({map,maplibregl:lib,getFeatures:()=>officialMode?officialExplorer.selected():[],getEnabledCategories:()=>officialMode?officialExplorer.enabled():emptyEnabled,getLanguage:()=>lang(),onSingle:popup,onGroup:groupPopup});
 domOverlay.start();
 const pointsToggle=document.getElementById('official-points-toggle');
 pointsToggle?.addEventListener('change',()=>{
   domOverlay?.setVisible(officialMode && Boolean(pointsToggle.checked));
   if(!pointsToggle.checked)closeOfficialPopup();
 });
 domOverlay.setVisible(false);
 map.on('style.load',install);
 map.on('load',install);
 map.on('click',e=>{
  if(!map.isStyleLoaded()||!enabled.size)return;
  // IBAMA interactions are intentionally handled by exact-coordinate DOM markers.
 });
 map.on('mousemove',e=>{
  // Keep cursor decisions for canonical events and their own interactive layers.
 });
 fetch('./data/ibama-2025.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(data=>{
   if(data?.year!==2025||data?.type!=='FeatureCollection'||!Array.isArray(data.features)||data.status==='pending-build')throw Error('IBAMA 2025 snapshot not generated');
   features=data.features.filter(f=>f?.geometry?.type==='Point'&&Array.isArray(f.geometry.coordinates)&&f?.properties?.date?.startsWith('2025-'));
   snapshotStats=data.stats||{};
   loadState='ready';
   if(enabled.size===0)TYPES.forEach(([key])=>enabled.add(key));
   officialExplorer?.setData(features);
   install();updateVisibility();
   domOverlay?.schedule();
 }).catch(err=>{console.error('IBAMA 2025:',err);loadState='missing';officialExplorer?.setError();});
}
export function refreshIbamaLanguage(){officialExplorer?.render();}
export function setIbamaOfficialMode(next) {
 officialMode=Boolean(next);
 closeOfficialPopup();
 officialExplorer?.setMode(officialMode?'official':'osint');
 kdeOverlay?.setOfficial(officialMode);
 updateVisibility();
 domOverlay?.setVisible(officialMode && Boolean(document.getElementById('official-points-toggle')?.checked));
}
export function ibama2025Health(){return {status:loadState,features:features.length,enabled:[...enabled],stats:snapshotStats,layer:!!map?.getLayer?.(id),dom:domOverlay?.health()||null,explorer:officialExplorer?.status()||null,kde:kdeOverlay?.health()||null};}
