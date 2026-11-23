/* IBAMA 2025 - Gaussian KDE with absolute, comparable count scale.
 * A record contributes exactly 1/100 to the kernel-density field before
 * Gaussian smoothing. The source contains one feature per administrative
 * notice, NOT one per unique coordinate, so coincident notices remain
 * separately weighted. Colours are fixed at absolute count-equivalent
 * thresholds: selecting 2 notices cannot renormalise into a red hotspot.
 */
export const KDE_REFERENCE_COUNT = 100;
export const KDE_RADIUS_KM = 15;
const SOURCE = 'official-ibama-kde-records';
const LAYER = 'official-ibama-kde-heatmap';
const stops = [
  0, 'rgba(0,0,0,0)',
  0.008, 'rgba(48,118,205,0)',
  0.012, 'rgba(48,118,205,0.43)',
  0.04, 'rgba(49,156,211,0.54)',
  0.10, 'rgba(85,205,173,0.64)',
  0.20, 'rgba(231,226,89,0.70)',
  0.40, 'rgba(244,166,50,0.77)',
  0.70, 'rgba(225,90,47,0.83)',
  1, 'rgba(181,32,38,0.87)'
];
const EMPTY={type:'FeatureCollection',features:[]};
export function createIbamaKde({map}) {
  let enabled=false, official=false, selected=[], lastCount=-1, errors=0;
  let installed=false, updateTimer=null;
  const rawFeature=f=>({type:'Feature',geometry:f.geometry,properties:{}});
  // The bandwidth is approximately 15 km near the equator through zoom 10.
  // Screen radius is capped at detailed street zooms so GPU kernels remain
  // practical and dots keep their local investigative utility.
  const radius=['interpolate',['exponential',2],['zoom'],
    3,1,5,3.4,6,6.8,7,13.6,8,27.2,9,54.4,10,108.8,11,160,15,160];
  const paint={
    'heatmap-weight':1/KDE_REFERENCE_COUNT,
    'heatmap-intensity':1,
    'heatmap-radius':radius,
    'heatmap-opacity':0.78,
    'heatmap-color':['interpolate',['linear'],['heatmap-density'],...stops]
  };
  const visible=()=>enabled&&official;
  function ensure() {
    if(!map?.isStyleLoaded?.())return false;
    try {
      if(!map.getSource(SOURCE))map.addSource(SOURCE,{type:'geojson',data:EMPTY});
      if(!map.getLayer(LAYER)) {
        const symbol=map.getStyle()?.layers?.find(l=>l.type==='symbol')?.id;
        map.addLayer({id:LAYER,type:'heatmap',source:SOURCE,
          layout:{visibility:visible()?'visible':'none'},paint},symbol);
        lastCount=-1;
      }
      map.setLayoutProperty(LAYER,'visibility',visible()?'visible':'none');
      return true;
    }catch(error){
      errors++;
      console.error('IBAMA KDE layer setup:',error);
      return false;
    }
  }
  function update() {
    if(!ensure())return;
    if(!visible())return;
    // Exact filtered records, including all notices at identical coordinates.
    const items=selected.filter(f=>f?.geometry?.type==='Point'&&
      Array.isArray(f.geometry.coordinates)&&
      f.geometry.coordinates.every(n=>Number.isFinite(Number(n))));
    map.getSource(SOURCE).setData({type:'FeatureCollection',features:items.map(rawFeature)});
    lastCount=items.length;
  }
  function schedule() {
    if(updateTimer!==null)clearTimeout(updateTimer);
    updateTimer=setTimeout(()=>{updateTimer=null;update();},80);
  }
  function init() {
    if(installed)return;
    installed=true;
    map.on('style.load',()=>{lastCount=-1;schedule();});
    map.on('load',schedule);
    schedule();
  }
  return {
    init,
    setEnabled(next){enabled=Boolean(next);schedule();},
    setOfficial(next){official=Boolean(next);schedule();},
    setSelected(records){selected=Array.isArray(records)?records:[];schedule();},
    health:()=>({enabled,official,visible:visible(),
      selectedRecords:selected.length,drawnRecords:visible()?lastCount:0,
      layer:!!map?.getLayer?.(LAYER),source:!!map?.getSource?.(SOURCE),
      referenceCount:KDE_REFERENCE_COUNT,bandwidthKm:KDE_RADIUS_KM,errors})
  };
}
