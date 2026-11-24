/* Map-first, institution-specific 2025 official-data explorer.
 * All statistics and list rows come from the SAME verified IBAMA GeoJSON.
 * No unsupported year is offered. The canonical OSINT feed remains separate.
 */
const $=id=>document.getElementById(id);
const SAFE=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const fmt=(n,lang)=>Number(n||0).toLocaleString(lang==='pt'?'pt-BR':lang==='es'?'es-ES':'en-US');
const D={
 pt:{osint:'EVENTOS OSINT',official:'DADOS OFICIAIS',strap:'Fontes independentes e rastreáveis',eyebrow:'FONTE OFICIAL / IBAMA',title:'Fiscalização ambiental',subtitle:'Autos de infração · Amazônia Legal brasileira',count:'autos na seleção',locations:'Localizações distintas',layers:'Camadas selecionadas',source:'Instituição oficial',year:'Ano dos registros',state:'Estado',allStates:'Todos os estados',search:'Buscar autos oficiais',searchHint:'Auto, município, operação, processo ou espécie...',types:'Tipos de infração',all:'Todas',none:'Nenhuma',reset:'Limpar filtros oficiais',available:'Base oficial disponível: 2025. Outros anos ainda não foram importados.',records:'Autos oficiais',more:'Mostrar mais autos',caution:'Autos de infração são registros administrativos, não condenações criminais. Recorte: UFs da Amazônia Legal, não o limite exato do bioma.',empty:'Nenhum auto corresponde aos filtros selecionados.',loading:'Carregando dados oficiais…',error:'Não foi possível carregar os dados oficiais.',sourceOption:'IBAMA · Autos de infração',mapCaption:'IBAMA · 2025 · Autos de infração',menuTitle:'Camadas e fontes',points:'Mostrar pontos',kde:'Hotspots',kdeCaption:'Densidade relativa · cada auto contribui com peso 1',kdeLow:'Menor densidade',kdeHigh:'Maior densidade'},
 en:{osint:'OSINT EVENTS',official:'OFFICIAL DATA',strap:'Independent and traceable data collections',eyebrow:'OFFICIAL SOURCE / IBAMA',title:'Environmental enforcement',subtitle:'Administrative inspection notices · Brazilian Legal Amazon',count:'notices in selection',locations:'Distinct locations',layers:'Selected layers',source:'Official institution',year:'Record year',state:'State',allStates:'All states',search:'Search official records',searchHint:'Notice, municipality, operation, process or species...',types:'Types of infraction',all:'All',none:'None',reset:'Clear official filters',available:'Available official data: 2025. Other years have not been imported.',records:'Official notices',more:'Show more notices',caution:'Inspection notices are administrative records, not criminal convictions. Scope: Legal Amazon states, not the exact Amazon biome boundary.',empty:'No official notices match the filters.',loading:'Loading official records…',error:'Official records are unavailable.',sourceOption:'IBAMA · Inspection notices',mapCaption:'IBAMA · 2025 · Inspection notices',menuTitle:'Layers and sources',points:'Show points',kde:'Hotspots',kdeCaption:'Relative density · each notice has weight 1',kdeLow:'Lower density',kdeHigh:'Higher density'},
 es:{osint:'EVENTOS OSINT',official:'DATOS OFICIALES',strap:'Fuentes independientes y trazables',eyebrow:'FUENTE OFICIAL / IBAMA',title:'Fiscalización ambiental',subtitle:'Actas administrativas · Amazonía Legal brasileña',count:'actas en la selección',locations:'Localizaciones distintas',layers:'Capas seleccionadas',source:'Institución oficial',year:'Año de los registros',state:'Estado',allStates:'Todos los estados',search:'Buscar registros oficiales',searchHint:'Acta, municipio, operación, expediente o especie...',types:'Tipos de infracción',all:'Todas',none:'Ninguna',reset:'Borrar filtros oficiales',available:'Datos oficiales disponibles: 2025. Otros años aún no se han importado.',records:'Actas oficiales',more:'Mostrar más actas',caution:'Las actas de infracción son registros administrativos, no condenas penales. Ámbito: estados de la Amazonía Legal, no el límite exacto del bioma.',empty:'Ningún acta coincide con los filtros.',loading:'Cargando datos oficiales…',error:'No se pudieron cargar los datos oficiales.',sourceOption:'IBAMA · Actas de infracción',mapCaption:'IBAMA · 2025 · Actas de infracción',menuTitle:'Capas y fuentes',points:'Mostrar puntos',kde:'Hotspots',kdeCaption:'Densidad relativa · cada acta tiene peso 1',kdeLow:'Menor densidad',kdeHigh:'Mayor densidad'}
};
const STATES=['AC','AM','AP','MA','MT','PA','RO','RR','TO'];
const TYPES=[
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
const lookup=Object.fromEntries(TYPES.map(t=>[t[0],t]));
export function createOfficialExplorer({getLanguage,onChange,onSelectRecord}){
 let features=[],ready=false,error=false,mode='osint',search='',state='all',year='2025',visibleLimit=36,enabled=new Set(),selected=[];
 const language=()=>['pt','en','es'].includes(getLanguage())?getLanguage():'en';
 const t=()=>D[language()];
 const categories=f=>f?.properties?.categories?.length?f.properties.categories:[f?.properties?.category||'other'];
 const stableFeatures=()=>features.filter(f=>String(f.properties?.date||'').slice(0,4)===year);
 function filtered(ignoreCategories=false){
  const query=clean(search);
  return stableFeatures().filter(f=>{
   const p=f.properties||{};
   if(state!=='all'&&p.uf!==state)return false;
   if(query){
    const hay=clean([p.notice,p.date,p.uf,p.municipality,p.type,p.id,
      p.official?.process,p.official?.operation,p.official?.infraction_description,
      ...(p.species_referenced||[]).flatMap(x=>[x.scientific_name,x.common_name])].filter(Boolean).join(' '));
    if(!hay.includes(query))return false;
   }
   return ignoreCategories||categories(f).some(cat=>enabled.has(cat));
  });
 }
 const signature=f=>f.geometry.coordinates.map(Number).join(',');
 function renderLabels(){
  const l=t();
  const pairs=[
   ['official-eyebrow','eyebrow'],['official-title','title'],['official-subtitle','subtitle'],
   ['official-count-label','count'],['official-location-label','locations'],['official-category-label','layers'],
   ['official-source-label','source'],['official-year-label','year'],['official-state-label','state'],
   ['official-search-label','search'],['official-layer-heading','types'],['official-results-title','records'],
   ['official-select-all','all'],['official-select-none','none'],['official-availability','available'],
   ['official-caution','caution'],['official-more','more'],['data-mode-caption','strap'],
   ['official-points-label','points'],['official-kde-label','kde'],['official-kde-legend-caption','kdeCaption'],['official-kde-legend-low','kdeLow'],['official-kde-legend-high','kdeHigh'],
   ['official-map-caption','mapCaption']
  ];
  for(const [id,key] of pairs){const el=$(id);if(el)el.textContent=l[key];}
  if($('official-search'))$('official-search').placeholder=l.searchHint;
  if($('official-reset'))$('official-reset').textContent='↺ '+l.reset;
  if($('official-source'))$('official-source').options[0].textContent=l.sourceOption;
  if($('official-state'))$('official-state').options[0].textContent=l.allStates;
  for(const [key,val] of [['osint',l.osint],['official',l.official]]){
   const el=document.querySelector('[data-explorer-label="'+key+'"]');
   if(el)el.textContent=val;
  }
 }
 function renderCategories(){
  const lang=language();
  const all=filtered(true), counts=Object.fromEntries(TYPES.map(([k])=>[k,0]));
  for(const f of all)for(const k of categories(f))if(k in counts)counts[k]+=1;
  const allButton=$('official-select-all'), noneButton=$('official-select-none');
  const allChosen=enabled.size===TYPES.length,noneChosen=enabled.size===0;
  for(const [button,active] of [[allButton,allChosen],[noneButton,noneChosen]]){
   if(!button)continue;
   button.classList.toggle('active',active);
   button.setAttribute('aria-pressed',String(active));
  }
  const host=$('official-category-list');
  if(!host)return;
  host.innerHTML=TYPES.map(([key,color,labels])=>'<label class="official-category-row'+(enabled.has(key)?' selected':'')+'"><input type="checkbox" class="official-category-toggle" value="'+key+'"'+(enabled.has(key)?' checked':'')+'><i class="official-category-dot" style="--category-color:'+color+'"></i><span>'+SAFE(labels[lang]||labels.pt)+'</span><b>'+fmt(counts[key],lang)+'</b></label>').join('');
  host.querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>{
   if(input.checked)enabled.add(input.value);else enabled.delete(input.value);
   visibleLimit=36;renderCategories();refresh();
  }));
 }
 function renderResults(){
  const host=$('official-results-feed');if(!host)return;
  if(!ready){host.innerHTML='<p class="official-empty">'+SAFE(error?t().error:t().loading)+'</p>';if($('official-more'))$('official-more').hidden=true;return;}
  if(!selected.length){host.innerHTML='<p class="official-empty">'+SAFE(t().empty)+'</p>';if($('official-more'))$('official-more').hidden=true;return;}
  host.innerHTML=selected.slice(0,visibleLimit).map(f=>{
   const p=f.properties||{};
   const cats=categories(f);
   const primary=cats[0]||'other';
   const meta=lookup[primary]||lookup.other;
   const label=cats.map(k=>lookup[k]?.[2]?.[language()]||k).join(' · ');
   return '<button class="official-result-item" type="button" data-record-id="'+SAFE(p.id)+'"><span class="official-result-line"><i class="official-result-dot" style="--category-color:'+meta[1]+'"></i><strong>'+SAFE(p.notice||p.id||'IBAMA')+'</strong><time>'+SAFE(p.date||'')+'</time></span><span class="official-result-place">'+SAFE([p.municipality,p.uf].filter(Boolean).join(' · '))+'</span><span class="official-result-category">'+SAFE(label)+'</span></button>';
  }).join('');
  host.querySelectorAll('.official-result-item').forEach(button=>button.addEventListener('click',()=>{
   const f=selected.find(f=>String(f.properties?.id)===button.dataset.recordId);
   if(f)onSelectRecord(f);
  }));
  const more=$('official-more');if(more)more.hidden=selected.length<=visibleLimit;
 }
 function refresh(){
  selected=ready?filtered().sort((a,b)=>String(b.properties?.date||'').localeCompare(String(a.properties?.date||''))||String(a.properties?.id||'').localeCompare(String(b.properties?.id||''))):[];
  const lang=language();
  const locations=new Set(selected.map(signature)).size;
  for(const [id,v] of [['official-total',fmt(selected.length,lang)],['official-location-count',fmt(locations,lang)],['official-category-count',fmt(enabled.size,lang)],['official-result-count',fmt(selected.length,lang)]])if($(id))$(id).textContent=v;
  renderResults();
  onChange?.();
 }
 function render(){
  renderLabels();
  renderCategories();
  refresh();
 }
 function init(){
  if(!$('official-rail'))return;
  $('official-state').innerHTML='<option value="all">'+SAFE(t().allStates)+'</option>'+STATES.map(s=>'<option value="'+s+'">'+s+'</option>').join('');
  $('official-state').value=state;
  $('official-year').value='2025';
  $('official-source').value='ibama';
  $('official-state').addEventListener('change',e=>{state=e.target.value;visibleLimit=36;renderCategories();refresh();});
  $('official-year').addEventListener('change',e=>{year=e.target.value;visibleLimit=36;renderCategories();refresh();});
  $('official-search').addEventListener('input',e=>{search=e.target.value;visibleLimit=36;renderCategories();refresh();});
  $('official-select-all').addEventListener('click',()=>{TYPES.forEach(t=>enabled.add(t[0]));renderCategories();refresh();});
  $('official-select-none').addEventListener('click',()=>{enabled.clear();renderCategories();refresh();});
  $('official-reset').addEventListener('click',()=>{
   year='2025';state='all';search='';visibleLimit=36;enabled=new Set();
   $('official-year').value=year;$('official-state').value=state;$('official-search').value=search;
   render();
  });
  $('official-more').addEventListener('click',()=>{visibleLimit+=36;renderResults();});
  render();
 }
 return {
  init,render,selected:()=>selected,enabled:()=>enabled,mode:()=>mode,
  setMode(next){mode=next;refresh();},
  setData(next){features=Array.isArray(next)?next:[];ready=true;error=false;render();},
  setError(){error=true;ready=false;render();},
  status:()=>({mode,ready,year,state,search,visible:selected.length,selectedLocations:new Set(selected.map(signature)).size})
 };
}
