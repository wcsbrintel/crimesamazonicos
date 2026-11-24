/**
 * Official IBAMA 2025 markers: inspired by Global Role's zoom-dependent
 * black/grey point cloud and city summaries. This is an independent
 * implementation; no logos, vacancies, flags or borrowed site assets.
 *
 * At zoom < 7, only records with the SAME documented municipality and UF
 * aggregate to one city marker. Individual records never change coordinates.
 * At zoom >= 7, each DISTINCT exact coordinate becomes one small neutral dot.
 * Exact overlaps continue to open the authentic choice list.
 */
export const IBAMA_CITY_ZOOM = 7;

export function exactCoordinateGroups(features, enabledCategories) {
 const sites=new Map();
 for(const feature of features||[]){
  const p=feature?.properties||{};
  if(!(p.categories||[p.category||'other']).some(c=>enabledCategories.has(c)))continue;
  const xy=feature?.geometry?.coordinates;
  if(feature?.geometry?.type!=='Point'||!Array.isArray(xy)||xy.length<2)continue;
  const lon=Number(xy[0]),lat=Number(xy[1]);
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)continue;
  const key=lon+','+lat;
  if(!sites.has(key))sites.set(key,{key,lon,lat,members:[],categories:new Set(),kind:'exact'});
  const group=sites.get(key);
  group.members.push(feature);
  for(const c of p.categories||[p.category||'other'])if(enabledCategories.has(c))group.categories.add(c);
 }
 return [...sites.values()];
}

// Group ONLY by IBAMA's municipality and UF attributes, never by pixel
// distance, nearby city names or an inferred geocoding result.
export function municipalityGroups(exactGroups){
 const groups=new Map();
 for(const site of exactGroups){
  for(const feature of site.members){
   const p=feature.properties||{};
   const municipality=String(p.municipality||'').trim();
   const uf=String(p.uf||'').trim().toUpperCase();
   const hasMunicipality=municipality&&uf;
   const key=hasMunicipality?'city:'+uf+':'+municipality.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase():'exact:'+site.key;
   if(!groups.has(key))groups.set(key,{key,lon:0,lat:0,members:[],categories:new Set(),
     kind:hasMunicipality?'city':'exact',municipality:hasMunicipality?municipality:'',uf,locations:new Set()});
   const g=groups.get(key);
   g.members.push(feature);
   g.locations.add(site.key);
   g.lon+=site.lon;
   g.lat+=site.lat;
   for(const c of p.categories||[p.category||'other'])g.categories.add(c);
  }
 }
 return [...groups.values()].map(g=>({...g,lon:g.lon/g.members.length,lat:g.lat/g.members.length}));
}

export function createIbamaDomOverlay({map,maplibregl,getFeatures,getEnabledCategories,getLanguage,onSingle,onGroup}){
 const markers=new Map();
 let timer=null,installed=false,pointsVisible=true,visibleRecords=0,visibleSites=0,
   coincidentSites=0,selectedSites=0,displayMode='exact',cityMarkers=0;
 const locale=()=>getLanguage()==='pt'?'pt-BR':getLanguage()==='es'?'es-ES':'en-US';
 function clear(){
  for(const m of markers.values())m.marker.remove();
  markers.clear();
 }
 function visible(lon,lat,width,height){
  try{if(map.transform?.isLocationOccluded?.(maplibregl.LngLat.convert([lon,lat])))return false;}catch{}
  const pt=map.project([lon,lat]);
  return Number.isFinite(pt.x)&&Number.isFinite(pt.y)&&pt.x>=-45&&pt.y>=-45&&pt.x<=width+45&&pt.y<=height+45;
 }
 function render(){
  if(!map||!maplibregl?.Marker)return;
  if(!pointsVisible){clear();visibleRecords=visibleSites=coincidentSites=cityMarkers=0;return;}
  const canvas=map.getCanvas(),width=canvas?.clientWidth||0,height=canvas?.clientHeight||0;
  if(!width||!height)return;
  const exact=exactCoordinateGroups(getFeatures(),getEnabledCategories());
  selectedSites=exact.length;
  const cityMode=map.getZoom()<IBAMA_CITY_ZOOM;
  displayMode=cityMode?'city':'exact';
  const groups=cityMode?municipalityGroups(exact):exact;
  const wanted=new Set();
  visibleRecords=visibleSites=coincidentSites=cityMarkers=0;
  for(const group of groups){
   if(!visible(group.lon,group.lat,width,height))continue;
   const n=group.members.length;
   visibleRecords+=n;
   visibleSites++;
   if(n>1)coincidentSites++;
   const isCity=cityMode&&group.kind==='city'&&n>1;
   if(isCity)cityMarkers++;
   wanted.add(group.key);
   let entry=markers.get(group.key);
   if(!entry){
    const button=document.createElement('button');
    button.type='button';
    button.className='ibama-html-pin';
    button.addEventListener('pointerdown',e=>e.stopPropagation());
    button.addEventListener('mousedown',e=>e.stopPropagation());
    const marker=new maplibregl.Marker({element:button,anchor:'center'}).setLngLat([group.lon,group.lat]).addTo(map);
    entry={button,marker,group};
    markers.set(group.key,entry);
    button.addEventListener('click',e=>{
     e.preventDefault();e.stopPropagation();
     const selected=entry.group;
     const loc={lng:selected.lon,lat:selected.lat};
     if(selected.members.length>1)onGroup(selected,loc);
     else onSingle(selected.members[0].properties,loc);
    });
   }
   entry.group=group;
   entry.marker.setLngLat([group.lon,group.lat]);
   entry.button.classList.toggle('ibama-city-group',Boolean(isCity));
   entry.button.classList.toggle('ibama-html-cluster',n>1&&!isCity);
   // Just two neutral tones, as in the visual reference. No category colours.
   entry.button.style.setProperty('--ibama-color',n>1?'#595e61':'#252729');
   entry.button.style.setProperty('--city-size',Math.min(38,Math.max(21,21+Math.log2(n)*2.4)).toFixed(1)+'px');
   entry.button.textContent=isCity?n.toLocaleString(locale()):'';
   const title=isCity?group.municipality+' · '+group.uf+' · '+n.toLocaleString(locale())+
      (getLanguage()==='pt'?' autos oficiais':getLanguage()==='es'?' actas oficiales':' official notices')
     :n>1?n.toLocaleString(locale())+' records at identical coordinates':'Official IBAMA record';
   entry.button.title=title;
   entry.button.setAttribute('aria-label',title);
  }
  for(const [key,entry]of markers)if(!wanted.has(key)){entry.marker.remove();markers.delete(key);}
 }
 function schedule(){
  if(timer!==null)clearTimeout(timer);
  timer=setTimeout(()=>{timer=null;try{render();}catch(e){console.error('IBAMA marker render:',e);}},65);
 }
 function start(){
  if(installed)return;
  installed=true;
  for(const event of ['load','moveend','zoomend','resize','style.load'])map.on(event,schedule);
  schedule();
 }
 return {
  start,schedule,clear,
  setVisible(next){pointsVisible=Boolean(next);if(!pointsVisible)clear();schedule();},
  health:()=>({domMarkers:markers.size,pointsVisible,displayMode,cityMarkers,
    cityZoom:IBAMA_CITY_ZOOM,exactLocationsOnMap:visibleSites,
    coincidentLocationsOnMap:coincidentSites,selectedDistinctLocations:selectedSites,
    recordsInViewport:visibleRecords,enabledCategories:[...getEnabledCategories()]})
 };
}
