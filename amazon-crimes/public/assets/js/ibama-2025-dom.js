/**
 * Resilient DOM-based markers for georeferenced IBAMA 2025 administrative notices.
 *
 * A MapLibre stylesheet/projection swap cannot remove a Marker DOM element;
 * this protects the independent IBAMA view in 2D and Globe modes. Visible
 * points are grouped by screen-cell and category to avoid thousands of nodes.
 * Grouping recalculates on moveend and zoomend (not while panning).
 */
export function createIbamaDomOverlay({
  map,
  maplibregl,
  getFeatures,
  getEnabledCategories,
  getLanguage,
  onSingle,
  onGroup
}) {
  const colors = {
    deforestation: '#da7048',
    logging: '#aa814b',
    flora_other: '#7dba72',
    wildlife: '#56a989',
    fishing: '#4cace0',
    mining: '#d7b14b',
    pollution: '#9584d0',
    fire: '#df824d',
    other: '#8e9b9c'
  };
  const markers = [];
  let timer = null;
  let visibleRecords = 0;
  let totalGroups = 0;
  let installed = false;

  function clear() {
    while (markers.length) markers.pop().remove();
  }

  function compact(n) {
    return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'k' : String(n);
  }

  function render() {
    if (!map || !maplibregl?.Marker) return;
    const canvas = map.getCanvas();
    const width = canvas?.clientWidth || 0;
    const height = canvas?.clientHeight || 0;
    if (!width || !height) return;

    const enabled = getEnabledCategories();
    const features = getFeatures();
    if (!enabled.size || !features.length) {
      clear();
      visibleRecords = 0;
      totalGroups = 0;
      return;
    }

    // Per-category spatial bins preserve the meaning of individual checkboxes.
    // At detailed zooms the grid shrinks, separating close geographic records.
    const zoom = map.getZoom();
    const cell = zoom <= 4 ? 62 : zoom <= 7 ? 51 : zoom <= 10 ? 39 : 28;
    const buckets = new Map();
    visibleRecords = 0;

    for (const feature of features) {
      const cat = feature?.properties?.category || 'other';
      if (!enabled.has(cat)) continue;
      const coords = feature?.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) continue;
      const lon = Number(coords[0]), lat = Number(coords[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;

      const pos = map.project([lon, lat]);
      if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) ||
          pos.x < -24 || pos.y < -24 || pos.x > width + 24 || pos.y > height + 24) continue;
      visibleRecords += 1;

      const col = Math.floor(pos.x / cell), row = Math.floor(pos.y / cell);
      const key = cat + '|' + col + '|' + row;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { category: cat, count: 0, lonSum: 0, latSum: 0, first: feature, samples: [] };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      bucket.lonSum += lon;
      bucket.latSum += lat;
      if (bucket.samples.length < 8) bucket.samples.push(feature);
    }

    let groups = [...buckets.values()];
    totalGroups = groups.length;
    // Bound DOM work while keeping minority categories represented.
    const MAX_MARKERS = 650;
    if (groups.length > MAX_MARKERS) {
      groups.sort((a, b) => b.count - a.count);
      const represented = new Set();
      const kept = [];
      for (const group of groups) {
        if (represented.has(group.category)) continue;
        kept.push(group);
        represented.add(group.category);
      }
      for (const group of groups) {
        if (kept.length >= MAX_MARKERS) break;
        if (!kept.includes(group)) kept.push(group);
      }
      groups = kept;
    }

    clear();
    const locale = getLanguage() === 'pt' ? 'pt-BR' : getLanguage() === 'es' ? 'es-ES' : 'en-US';
    for (const group of groups) {
      const lon = group.lonSum / group.count;
      const lat = group.latSum / group.count;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ibama-html-pin' + (group.count > 1 ? ' ibama-html-cluster' : '');
      btn.style.setProperty('--ibama-color', colors[group.category] || '#8e9b9c');
      if (group.count > 1) btn.textContent = compact(group.count);
      btn.setAttribute('aria-label', 'IBAMA 2025: ' + group.count.toLocaleString(locale) + ' · ' + group.category);
      btn.title = btn.getAttribute('aria-label');
      btn.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        const center = { lng: lon, lat };
        if (group.count > 1) {
          if (map.getZoom() < 13.6) {
            map.easeTo({ center: [lon, lat], zoom: Math.min(15, map.getZoom() + 2.3), duration: 400 });
          } else {
            onGroup(group, center);
          }
        } else {
          onSingle(group.first.properties, center);
        }
      });
      const marker = new maplibregl.Marker({ element: btn, anchor: 'center' })
        .setLngLat([lon, lat])
        .addTo(map);
      markers.push(marker);
    }
  }

  function schedule() {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      try { render(); } catch (error) { console.error('IBAMA DOM marker render failed:', error); }
    }, 70);
  }

  function start() {
    if (installed) return;
    installed = true;
    // Independent from style.load: GeoJSON styling cannot suppress DOM markers.
    map.on('load', schedule);
    map.on('moveend', schedule);
    map.on('zoomend', schedule);
    map.on('resize', schedule);
    map.on('style.load', schedule);
    schedule();
  }

  return {
    start,
    schedule,
    health: () => ({
      domMarkers: markers.length,
      groupedCells: totalGroups,
      recordsInViewport: visibleRecords,
      enabledCategories: [...getEnabledCategories()]
    })
  };
}
