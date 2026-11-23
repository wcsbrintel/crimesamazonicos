// Independent 2025 IBAMA administrative layer. Does not modify canonical OSINT events.
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
const lang=()=>copy[getLanguage?.()] ? getLanguage() : 'en';
const html=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fc=()=>({type:'FeatureCollection',features});
function render(){
 const panel=document.getElementById('ibama-layer-section'); if(!panel)return;
 const tr=copy[lang()];
 const counts=Object.fromEntries(TYPES.map(([id])=>[id,0]));
 for(const f of features){const c=f.properties?.category;if(c in counts)counts[c]++;}
 panel.innerHTML='<div class="layer-section-title"><span>'+html(tr.heading)+'</span><small class="ibama-count">'+features.length.toLocaleString(lang())+' '+html(tr.count)+'</small></div>'+
 '<p class="ibama-note">'+html(tr.note)+'</p>'+
 '<div class="ibama-actions"><button type="button" id="ibama-all">'+html(tr.on)+'</button><button type="button" id="ibama-none">'+html(tr.off)+'</button></div>'+
 '<div class="layer-list">'+TYPES.map(([key,color,labels])=>'<label class="layer-row"><input class="ibama-category" type="checkbox" value="'+key+'" '+(enabled.has(key)?'checked':'')+' '+(features.length?'':'disabled')+'><span class="layer-dot-marker" style="--swatch:'+color+'"></span><span>'+html(labels[lang()])+' <small>('+counts[key].toLocaleString(lang())+')</small></span></label>').join('')+'</div>'+
 '<div class="ibama-source-state">'+(loadState==='ready'?html(tr.status):loadState==='loading'?html(tr.loading):html(tr.missing))+' · <a href="https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao" target="_blank" rel="noopener noreferrer">IBAMA</a></div>';
 panel.querySelectorAll('.ibama-category').forEach(e=>e.addEventListener('change',()=>{if(e.checked)enabled.add(e.value);else enabled.delete(e.value);updateVisibility();}));
 panel.querySelector('#ibama-all').addEventListener('click',()=>{TYPES.forEach(t=>enabled.add(t[0]));render();updateVisibility();});
 panel.querySelector('#ibama-none').addEventListener('click',()=>{enabled.clear();render();updateVisibility();});
}
function install(){
 if(!map?.isStyleLoaded?.()) return;
 if(!map.getSource(source))map.addSource(source,{type:'geojson',data:fc(),cluster:true,clusterRadius:35,clusterMaxZoom:10});
 else map.getSource(source).setData(fc());
 if(!map.getLayer(id+'-clusters'))map.addLayer({id:id+'-clusters',type:'circle',source,filter:['has','point_count'],paint:{'circle-color':'#669d83','circle-radius':['step',['get','point_count'],13,100,18,1000,24],'circle-stroke-color':'#ffffff','circle-stroke-width':1.1,'circle-opacity':0.86}});
 if(!map.getLayer(id+'-cluster-count'))map.addLayer({id:id+'-cluster-count',type:'symbol',source,filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-size':11},paint:{'text-color':'#ffffff'}});
 if(!map.getLayer(id))map.addLayer({id,type:'circle',source,filter:['!', ['has','point_count']],paint:{
 'circle-color':['match',['get','category'],...TYPES.flatMap(t=>[t[0],t[1]]),'#8e9b9c'],
 'circle-radius':['interpolate',['linear'],['zoom'],2,3.5,7,5.1,12,7],
 'circle-stroke-width':1.3,'circle-stroke-color':'#ffffff','circle-opacity':0.83}});
 updateVisibility();
}
function updateVisibility(){
 if(!map?.isStyleLoaded?.())return;
 const any=enabled.size>0&&features.length>0;
 for(const layer of [id,id+'-clusters',id+'-cluster-count'])if(map.getLayer(layer))map.setLayoutProperty(layer,'visibility',any?'visible':'none');
 if(map.getLayer(id)) map.setFilter(id,['all',['!', ['has','point_count']],['in',['get','category'],['literal',[...enabled]]]]);
 // Clusters are computed from all 2025 features; when a subset is selected, rebuild the
 // GeoJSON source so cluster membership respects category toggles.
 if(map.getSource(source))map.getSource(source).setData({type:'FeatureCollection',features:features.filter(f=>enabled.has(f.properties.category))});
}
function popup(props,location){
 const tr=copy[lang()];
 const cat=TYPES.find(t=>t[0]===props.category);
 const label=cat?.[2]?.[lang()]||props.category;
 const rows=[[tr.date,props.date],['UF',props.uf],['Município / Municipality',props.municipality],['Nº',props.notice],['Tipo / Type',props.type],['Classificação / Classification',label]];
 const body=rows.filter(x=>x[1]).map(([a,b])=>'<div><strong>'+html(a)+':</strong> '+html(b)+'</div>').join('');
 new lib.Popup({maxWidth:'340px'}).setLngLat(location).setHTML('<div class="ibama-popup"><strong>IBAMA · 2025</strong><p>'+html(tr.status)+'</p>'+body+'<p><a href="'+html(props.source_url||'https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao')+'" target="_blank" rel="noopener noreferrer">'+html(tr.source)+'</a></p></div>').addTo(map);
}
export function installIbama2025(theMap,theLibrary,languageGetter){
 map=theMap;lib=theLibrary;getLanguage=languageGetter;
 const panel=document.getElementById('ibama-layer-section');
 if(!panel)return;
 render();
 map.on('style.load',install);
 map.on('load',install);
 map.on('click',e=>{
  if(!map.isStyleLoaded()||!enabled.size)return;
  const layers=[id,id+'-clusters'].filter(name=>map.getLayer(name));if(!layers.length)return;
  const f=map.queryRenderedFeatures(e.point,{layers})[0];if(!f)return;
  if(f.properties?.cluster){map.getSource(source)?.getClusterExpansionZoom(f.properties.cluster_id,(err,z)=>{if(!err)map.easeTo({center:f.geometry.coordinates,zoom:z});});return;}
  popup(f.properties,e.lngLat);
 });
 map.on('mousemove',e=>{
  const layers=[id,id+'-clusters'].filter(name=>map.getLayer(name));
  if(layers.length&&enabled.size&&map.queryRenderedFeatures(e.point,{layers}).length)map.getCanvas().style.cursor='pointer';
 });
 fetch('./data/ibama-2025.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()}).then(data=>{
   if(data?.year!==2025||data?.type!=='FeatureCollection'||!Array.isArray(data.features)||data.status==='pending-build')throw Error('IBAMA 2025 snapshot not generated');
   features=data.features.filter(f=>f?.geometry?.type==='Point'&&Array.isArray(f.geometry.coordinates)&&f?.properties?.date?.startsWith('2025-'));
   snapshotStats=data.stats||{};
   loadState='ready';render();install();updateVisibility();
 }).catch(err=>{console.error('IBAMA 2025:',err);loadState='missing';render();});
}
export function refreshIbamaLanguage(){render();}
export function ibama2025Health(){return {status:loadState,features:features.length,enabled:[...enabled],stats:snapshotStats,layer:!!map?.getLayer?.(id)};}
