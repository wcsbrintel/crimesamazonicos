/* The exact MapLibre heatmap rendering used by the global wildlife
 * trafficking observatory (seizure-hotspots.js): kernel radius, zoom
 * intensity, opacity, colours and unnormalised event_count weights.
 * Each filtered auto contributes one unit, with exact-coordinate
 * duplicates aggregated as a single weighted KDE source feature.
 * Heat intensity is RELATIVE to the kernel neighbourhood as in
 * the original; it is not an absolute incident-rate estimate.
 */
export const KDE_REFERENCE_COUNT = null;
export const KDE_PALETTE_VERSION = 'wildlife-exact-v3';
export const KDE_RADIUS_PIXELS = Object.freeze([12,22,38,62]);
const SOURCE='official-ibama-kde-records';
const LAYER='official-ibama-kde-heatmap';
const EMPTY={type:'FeatureCollection',features:[]};

export function buildIbamaDensity(records){
 const sites=new Map();
 let n=0;
 for(const record of records||[]){
  const coords=record?.geometry?.coordinates;
  if(record?.geometry?.type!=='Point'||!Array.isArray(coords)||coords.length<2)continue;
  const lon=Number(coords[0]),lat=Number(coords[1]);
  if(!Number.isFinite(lon)||!Number.isFinite(lat)||Math.abs(lon)>180||Math.abs(lat)>90)continue;
  const key=lon+','+lat;
  const site=sites.get(key);
  if(site)site.count++;
  else sites.set(key,{lon,lat,count:1});
  n++;
 }
 return {total:n,locations:sites.size,collection:{
  type:'FeatureCollection',
  features:[...sites.values()].map(site=>({
   type:'Feature',
   properties:{event_count:site.count},
   geometry:{type:'Point',coordinates:[site.lon,site.lat]}
  }))
 }};
}
const PAINT={
 'heatmap-weight':['get','event_count'],
 'heatmap-intensity':['interpolate',['linear'],['zoom'],0,0.85,8,1.35],
 'heatmap-radius':['interpolate',['linear'],['zoom'],0,12,3,22,7,38,12,62],
 'heatmap-opacity':0.83,
 'heatmap-color':['interpolate',['linear'],['heatmap-density'],
  0,'rgba(29,185,220,0)',0.12,'rgba(33,166,217,0.45)',
  0.3,'#1684c5',0.5,'#ffe65b',0.72,'#ff8f39',1,'#e63832']
};
export function createIbamaKde({map}){
 let enabled=false,official=false,selected=[],lastCount=-1,lastLocations=0,errors=0;
 let installed=false,updateTimer=null;
 const visible=()=>enabled&&official;
 function ensure(){
  if(!map?.isStyleLoaded?.())return false;
  try{
   if(!map.getSource(SOURCE))map.addSource(SOURCE,{type:'geojson',data:EMPTY});
   if(!map.getLayer(LAYER)){
    const before=map.getStyle()?.layers?.find(l=>l.type==='symbol')?.id;
    map.addLayer({
     id:LAYER,type:'heatmap',source:SOURCE,
     layout:{visibility:visible()?'visible':'none'},
     paint:PAINT
    },before);
    lastCount=-1;
   }
   map.setLayoutProperty(LAYER,'visibility',visible()?'visible':'none');
   return true;
  }catch(error){
   errors++;
   console.warn('IBAMA Hotspots layer not rendered',error);
   return false;
  }
 }
 function update(){
  if(!ensure()||!visible())return;
  const result=buildIbamaDensity(selected);
  map.getSource(SOURCE).setData(result.collection);
  lastCount=result.total;
  lastLocations=result.locations;
 }
 function schedule(){
  if(updateTimer!==null)clearTimeout(updateTimer);
  updateTimer=setTimeout(()=>{updateTimer=null;update();},75);
 }
 function init(){
  if(installed)return;
  installed=true;
  map.on('style.load',()=>{lastCount=-1;schedule();});
  map.on('load',schedule);
  map.on('idle',()=>{if(visible()&&!map.getLayer(LAYER))schedule();});
  schedule();
 }
 return {
  init,
  setEnabled(next){enabled=Boolean(next);schedule();},
  setOfficial(next){official=Boolean(next);schedule();},
  setSelected(records){selected=Array.isArray(records)?records:[];schedule();},
  health:()=>({
   enabled,official,visible:visible(),
   selectedRecords:selected.length,
   drawnRecords:visible()?lastCount:0,
   drawnLocations:visible()?lastLocations:0,
   layer:!!map?.getLayer?.(LAYER),source:!!map?.getSource?.(SOURCE),
   referenceCount:KDE_REFERENCE_COUNT,
   weighting:'actual-auto-count',
   scale:'relative',
   radiusPx:KDE_RADIUS_PIXELS,
   palette:KDE_PALETTE_VERSION,
   errors
  })
 };
}
