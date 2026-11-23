/**
 * IBAMA 2025 georeferenced notice markers.
 *
 * Distinct coordinates always retain distinct markers. Only records at the
 * exact same numeric longitude AND latitude share a selectable marker.
 * No screen-grid aggregation, zoom-based clustering or marker cap.
 *
 * DOM markers survive MapLibre style swaps and globe projection changes.
 */
export function exactCoordinateGroups(features, enabledCategories) {
  const sites = new Map();
  for (const feature of features || []) {
    const category = feature?.properties?.category || 'other';
    if (!(feature.properties?.categories || [category]).some(cat=>enabledCategories.has(cat))) continue;
    if (feature?.geometry?.type !== 'Point') continue;
    const coordinates = feature.geometry.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
    const lon = Number(coordinates[0]), lat = Number(coordinates[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)
        || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    // Numeric equivalence, not rounded coordinates or pixel proximity.
    const key = lon + ',' + lat;
    let site = sites.get(key);
    if (!site) {
      site = {key, lon, lat, members: [], categories: new Set()};
      sites.set(key, site);
    }
    site.members.push(feature);
    for (const c of (feature.properties?.categories||[category])) if (enabledCategories.has(c))site.categories.add(c);
  }
  return [...sites.values()];
}

export function createIbamaDomOverlay({
  map, maplibregl, getFeatures, getEnabledCategories, getLanguage,
  onSingle, onGroup
}) {
  const markers = new Map();
  let timer = null;
  let installed = false;
  let visibleRecords = 0;
  let visibleSites = 0;
  let coincidentSites = 0;
  let selectedSites = 0;

  function clear() {
    for (const entry of markers.values()) entry.marker.remove();
    markers.clear();
  }

  function isVisible(lon, lat, width, height) {
    // Globe: do not draw a marker on the opposite side of the planet.
    try {
      if (map.transform?.isLocationOccluded?.(maplibregl.LngLat.convert([lon, lat]))) return false;
    } catch (error) { /* MapLibre versions without this optional method */ }
    const pt = map.project([lon, lat]);
    return Number.isFinite(pt.x) && Number.isFinite(pt.y)
      && pt.x >= -20 && pt.y >= -20 && pt.x <= width + 20 && pt.y <= height + 20;
  }

  function render() {
    if (!map || !maplibregl?.Marker) return;
    const canvas = map.getCanvas();
    const width = canvas?.clientWidth || 0;
    const height = canvas?.clientHeight || 0;
    if (!width || !height) return;
    const groups = exactCoordinateGroups(getFeatures(), getEnabledCategories());
    const wanted = new Set();
    visibleRecords = 0;
    visibleSites = 0;
    coincidentSites = 0;
    selectedSites = groups.length;
    const language = getLanguage();
    const locale = language === 'pt' ? 'pt-BR' : language === 'es' ? 'es-ES' : 'en-US';

    for (const group of groups) {
      if (!isVisible(group.lon, group.lat, width, height)) continue;
      const count = group.members.length;
      visibleRecords += count;
      visibleSites += 1;
      if (count > 1) coincidentSites += 1;
      wanted.add(group.key);
      const category = group.members[0]?.properties?.category || 'other';
      let entry = markers.get(group.key);
      if (!entry) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ibama-html-pin';
        const marker = new maplibregl.Marker({element:button, anchor:'center'})
          .setLngLat([group.lon, group.lat]).addTo(map);
        entry = {marker, button, group};
        markers.set(group.key, entry);
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          const selected = entry.group;
          const location = {lng:selected.lon, lat:selected.lat};
          // A shared-location pin opens the choice list immediately:
          // no automatic zoom and no arbitrary selection of the first record.
          if (selected.members.length > 1) onGroup(selected, location);
          else onSingle(selected.members[0].properties, location);
        });
      }
      entry.group = group;
      entry.button.classList.toggle('ibama-html-cluster', count > 1);
      // Every site uses the same unobtrusive dot: no number, colored pin,
      // ring, flag or category icon. Exact overlaps still open a choice list.
      entry.button.textContent = '';
      const description = count > 1
        ? count.toLocaleString(locale) + ' IBAMA 2025 records at exactly the same coordinates'
        : 'IBAMA 2025 · ' + category;
      entry.button.setAttribute('aria-label', description);
      entry.button.title = description;
    }
    for (const [key, entry] of markers) {
      if (!wanted.has(key)) {
        entry.marker.remove();
        markers.delete(key);
      }
    }
  }

  function schedule() {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      try { render(); }
      catch (error) { console.error('IBAMA exact-coordinate marker render failed:', error); }
    }, 60);
  }
  function start() {
    if (installed) return;
    installed = true;
    map.on('load', schedule);
    map.on('moveend', schedule);
    map.on('zoomend', schedule);
    map.on('resize', schedule);
    map.on('style.load', schedule);
    schedule();
  }
  return {
    start, schedule, clear,
    health: () => ({
      domMarkers:markers.size,
      exactLocationsOnMap:visibleSites,
      coincidentLocationsOnMap:coincidentSites,
      selectedDistinctLocations:selectedSites,
      recordsInViewport:visibleRecords,
      enabledCategories:[...getEnabledCategories()]
    })
  };
}
