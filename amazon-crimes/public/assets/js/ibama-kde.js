/* IBAMA 2025 Hotspots: fixed, count-calibrated Gaussian KDE.
 * Each filtered administrative notice contributes one unit. Autos with
 * numerically identical source coordinates are aggregated with weight equal
 * to their count; no other spatial clustering or re-centering is performed.
 * A solitary auto has the SAME heatmap intensity regardless of how many
 * other autos are selected elsewhere. A low-volume site stays in the
 * blue range, even if it is the only selected site. Only overlapping
 * kernels with substantially more records reach yellow/orange/red.
 * This deliberately departs from the GLOBAL OBSERVATORY's uncalibrated
 * heatmap-weight, which can saturate isolated official sites red.
 */
export const KDE_REFERENCE_COUNT=25;
export const KDE_PALETTE_VERSION='ibama-count-calibrated-v4';
export const KDE_RADIUS_PIXELS=Object.freeze([12,22,38,62]);
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
// MapLibre heatmap-density is the sum of weighted Gaussian kernels, capped
// to [0,1] for the colour lookup. The weight scale is FIXED across all
// filters and zoom levels; never normalise by selection size or tile maximum.
export const KDE_PAINT={
 'heatmap-weight':['/', ['get','event_count'], KDE_REFERENCE_COUNT],
 'heatmap-intensity':1,
 'heatmap-radius':['interpolate',['linear'],['zoom'],0,12,3,22,7,38,12,62],
 'heatmap-opacity':0.83,
 'heatmap-color':['interpolate',['linear'],['heatmap-density'],
  0,'rgba(29,185,220,0)',
  0.008,'rgba(33,166,217,0.12)',
  0.025,'rgba(33,166,217,0.42)',
  0.07,'rgba(22,132,197,0.58)',
  0.12,'rgba(22,132,197,0.72)',
  0.25,'#ffe65b',
  0.5,'#ff8f39',
  0.85,'#e63832']
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
     paint:KDE_PAINT
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
   scale:'absolute-per-kernel',
   radiusPx:KDE_RADIUS_PIXELS,
   palette:KDE_PALETTE_VERSION,
   errors
  })
 };
}
