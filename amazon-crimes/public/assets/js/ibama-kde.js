/* IBAMA administrative-record Hotspots / Gaussian KDE (MapLibre).
 *
 * Visual grammar follows the original seizure-hotspots.js in
 * wcsbrintel/iwt_globalobservatory: same zoom-adaptive kernel radius,
 * zoom intensity, alpha and blue > yellow > orange > red ramp.
 *
 * Unlike the wildlife site's relative scale, this implementation uses a
 * FIXED reference of 100 official notices in the same KDE kernel. Each
 * distinct verified auto contributes one unit; co-located autos are grouped
 * into a single GeoJSON feature with event_count=N, not counted as one.
 * There is no filter-dependent maximum normalization: two notices never
 * acquire the same color merely because they are the only two selected.
 */
export const KDE_REFERENCE_COUNT = 100;
export const KDE_RADIUS_PIXELS = Object.freeze([12,22,38,62]);
export const KDE_PALETTE_VERSION = 'wildlife-reference-absolute-v2';
const SOURCE='official-ibama-kde-records';
const LAYER='official-ibama-kde-heatmap';
const EMPTY={type:'FeatureCollection',features:[]};

/* One kernel feature per EXACT georeferenced location, as in the global
 * Observatory. The record counts survive grouping and are summed in
 * heatmap-weight. Coordinate values are never pixel-rounded or clustered
 * by proximity. This is independent of marker visibility.
 */
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
 'heatmap-weight':['/', ['get','event_count'], KDE_REFERENCE_COUNT],
 'heatmap-intensity':['interpolate',['linear'],['zoom'],0,0.85,8,1.35],
 'heatmap-radius':['interpolate',['linear'],['zoom'],0,12,3,22,7,38,12,62],
 'heatmap-opacity':0.83,
 // Same blue/yellow/orange/red hues used by the wildlife-trafficking map.
 // Faint extra blue stops retain a readable trace of low-volume selections
 // without mapping their local maximum to red.
 'heatmap-color':['interpolate',['linear'],['heatmap-density'],
   0,'rgba(29,185,220,0)',
   0.015,'rgba(33,166,217,0.14)',
   0.04,'rgba(33,166,217,0.30)',
   0.12,'rgba(33,166,217,0.45)',
   0.30,'#1684c5',
   0.50,'#ffe65b',
   0.72,'#ff8f39',
   1,'#e63832']
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
   radiusPx:KDE_RADIUS_PIXELS,
   palette:KDE_PALETTE_VERSION,
   errors
  })
 };
}
