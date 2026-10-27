import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { escapeHtml as esc } from '../components/htmlEscape'
import { safeColor, safeNum, isSafeImageUrl } from '../components/mapSafe';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const hasPat = (p: string) => p && p !== 'solid' && p !== 'none';
const toDash = (ss: string, w: number) => ss === 'dashed' ? `${w * 3},${w * 2}` : ss === 'dotted' ? `${w},${w * 2}` : null;

function ensurePattern(svg: SVGSVGElement, pattern: string, fill: string, size: number) {
  let defs = svg.querySelector('defs');
  if (!defs) { defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs'); svg.insertBefore(defs, svg.firstChild); }
  const id = `pat_${pattern}_${fill.replace('#', '')}_${size}`;
  if (defs.querySelector(`#${id}`)) return id;
  const ns = 'http://www.w3.org/2000/svg';
  const p = document.createElementNS(ns, 'pattern');
  p.setAttribute('id', id); p.setAttribute('patternUnits', 'userSpaceOnUse');
  p.setAttribute('width', String(size)); p.setAttribute('height', String(size));
  const ln = (x1, y1, x2, y2) => { const l = document.createElementNS(ns, 'line'); [['x1', x1], ['y1', y1], ['x2', x2], ['y2', y2], ['stroke', fill], ['stroke-width', '2']].forEach(([k, v]) => l.setAttribute(k, String(v))); return l; };
  const dt = (cx, cy, r) => { const c = document.createElementNS(ns, 'circle'); [['cx', cx], ['cy', cy], ['r', r], ['fill', fill]].forEach(([k, v]) => c.setAttribute(k, String(v))); return c; };
  const s = size;
  ({ horizontal: () => p.appendChild(ln(0, s / 2, s, s / 2)), vertical: () => p.appendChild(ln(s / 2, 0, s / 2, s)), 'diagonal-right': () => p.appendChild(ln(0, 0, s, s)), 'diagonal-left': () => p.appendChild(ln(s, 0, 0, s)), crosshatch: () => { p.appendChild(ln(0, 0, s, s)); p.appendChild(ln(s, 0, 0, s)); }, grid: () => { p.appendChild(ln(s / 2, 0, s / 2, s)); p.appendChild(ln(0, s / 2, s, s / 2)); }, dots: () => p.appendChild(dt(s / 2, s / 2, s / 5)) }[pattern] || (() => { }))();
  defs.appendChild(p);
  return id;
}

function featureToLayer(feature: any, svgR: any) {
  const p = feature.properties || {}, g = feature.geometry;
  if (!g) return null;
  const stroke = safeColor(p.stroke || p.strokeHex) || '#ff4d6d';
  const fill   = safeColor(p.fill   || p.fillHex)   || '#3366ff';
  const weight = p.strokeWidth || 3;
  const op = p.fillOpacity ?? 0.3;
  const ss = p.strokeStyle || 'solid';
  const pat = p.fillPattern || 'solid';

  if (p.type === 'text' && g.type === 'Point') {
    const [lng, lat] = g.coordinates;
    const color = safeColor(p.textColor) || '#fff';
    const bg    = safeColor(p.textBg)    || '#ff4d6d';
    const size  = safeNum(p.textSize, 16);
    const baseZoom = safeNum(p.textBaseZoom, 14);
    return L.marker([lat, lng], {
      interactive: false, icon: L.divIcon({
        className: 'ol-text-wrap',
        html: `<div class="ol-map-text" data-base-size="${size}" data-base-zoom="${baseZoom}" style="font-size:${size}px;color:${color};background:${bg};display:inline-block;padding:5px 10px;border-radius:6px;font-weight:700;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,.28)">${esc(p.text || '')}</div>`,
        iconAnchor: [0, 0]
      })
    });
  }

  if (p.type === 'image' && g.type === 'Point') {
    const [lng, lat] = g.coordinates;
    const m = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'ol-img-wrap',
        html: `<div style="display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#2b3b6f;border:2px solid #fff;color:#fff;font-size:14px;box-shadow:0 2px 6px rgba(0,0,0,.3)">📷</div>`,
        iconAnchor: [14, 14]
      })
    });
    const title = esc(p.imageTitle || p.legendTitle || 'Image');
    const href = isSafeImageUrl(p.imageRef);          // '' if not a clean https URL
    const body = href
      ? `<a href="${esc(href)}" target="_blank" rel="noreferrer">
           <img src="${esc(href)}" alt="${title}"
             style="max-width:240px;max-height:200px;border-radius:8px;display:block;margin-top:6px" />
         </a>`
      : (p.imageRef ? `<br><small>${esc(p.imageRef)}</small>` : '');
    m.bindPopup(`<b>${title}</b>${body}`, { maxWidth: 280 });
    return m;
  }
   
  if (p.type === 'marker' || (!p.type && g.type === 'Point')) {
    const [lng, lat] = g.coordinates;
    const m = L.marker([lat, lng]);
    if (p.legendTitle) m.bindPopup(`<b>${esc(p.legendTitle)}</b>`);
    return m;
  }
  if (p.circleRadius != null && p.circleCenter) {
    const [lng, lat] = p.circleCenter;
    return L.circle([lat, lng], { radius: p.circleRadius, color: stroke, weight, fillColor: pat === 'none' ? 'transparent' : fill, fillOpacity: pat === 'none' ? 0 : (hasPat(pat) ? 0.08 : op), dashArray: toDash(ss, weight), renderer: svgR });
  }
  if (g.type === 'LineString')
    return L.polyline(g.coordinates.map(([lng, lat]) => [lat, lng]), { color: stroke, weight, dashArray: toDash(ss, weight), renderer: svgR });
  if (g.type === 'Polygon')
    return L.polygon(g.coordinates[0].map(([lng, lat]) => [lat, lng]), { color: stroke, weight, fillColor: pat === 'none' ? 'transparent' : fill, fillOpacity: pat === 'none' ? 0 : (hasPat(pat) ? 0.08 : op), dashArray: toDash(ss, weight), renderer: svgR });
  return null;
}

function applyPatterns(el: HTMLElement, groups: Record<string, any>) {
  const svg = el?.querySelector('.leaflet-overlay-pane svg') as SVGSVGElement | null;
  if (!svg) return;
  Object.values(groups).forEach(({ features }) => {
    features.forEach(({ layer, feature }) => {
      const p = feature.properties || {};
      if (!hasPat(p.fillPattern) || !layer._path) return;
      const id = ensurePattern(svg, p.fillPattern, p.fill || p.fillHex || '#3366ff', p.patternSize || 12);
      layer._path.setAttribute('fill', `url(#${id})`);
      layer._path.setAttribute('fill-opacity', String(p.fillOpacity ?? 0.3));
    });
  });
}

function scaleTexts(el: HTMLElement, z: number) {
  el?.querySelectorAll('.ol-map-text').forEach(t => {
    const textEl = t as HTMLElement;
    const b = parseFloat(textEl.dataset.baseSize || '') || 16;
    const bz = parseFloat(textEl.dataset.baseZoom || '') || 14;
    textEl.style.fontSize = Math.max(4, Math.round(b * Math.pow(2, z - bz))) + 'px';
  });
}

type MapProps = {
  center?: [number, number] | number[];
  zoom?: number;
  height?: string;
  markers?: any[];
  overlayGroups?: any[];
  visibleGroupIds?: string[];
  pickMode?: boolean;
  onPick?: (latlng: any) => void;
  pickedLocation?: any;
};

const DEFAULT_CENTER: [number, number] = [30.244, -97.712];
const EMPTY_MARKERS: any[] = [];
const EMPTY_OVERLAY_GROUPS: any[] = [];
const EMPTY_VISIBLE_GROUP_IDS: string[] = [];

export default function Map({
  center = DEFAULT_CENTER, zoom = 14, height = '400px',
  markers = EMPTY_MARKERS, overlayGroups = EMPTY_OVERLAY_GROUPS, visibleGroupIds = EMPTY_VISIBLE_GROUP_IDS,
  pickMode = false, onPick, pickedLocation,
}: MapProps) {
  const centerLat = center[0];
  const centerLng = center[1];
  const cRef = useRef<HTMLDivElement | null>(null);
  const mRef = useRef<L.Map | null>(null);
  const svgR = useRef<any>(null);
  const gRef = useRef<Record<string, any>>({});
  const mkRef = useRef<any[]>([]);
  const pkRef = useRef<any>(null);
  const ptRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialViewRef = useRef({ center: [centerLat, centerLng] as [number, number], zoom });

  useEffect(() => {
    if (!cRef.current || mRef.current) return;
    const initialView = initialViewRef.current;
    const m = L.map(cRef.current, { center: initialView.center, zoom: initialView.zoom, zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OSM</a>', maxZoom: 19
    }).addTo(m);
    svgR.current = L.svg({ padding: .5 });
    mRef.current = m;
    const refresh = () => {
      scaleTexts(m.getContainer(), m.getZoom());
      if (ptRef.current) clearTimeout(ptRef.current);
      ptRef.current = setTimeout(() => applyPatterns(m.getContainer(), gRef.current), 80);
    };
    m.on('zoomend', refresh);
    m.on('moveend', refresh);
    return () => {
      if (ptRef.current) clearTimeout(ptRef.current);
      m.remove();
      mRef.current = null;
      gRef.current = {};
    };
  }, []);

  useEffect(() => { mRef.current?.setView([centerLat, centerLng], zoom); }, [centerLat, centerLng, zoom]);

  useEffect(() => {
    const m = mRef.current; if (!m || !pickMode) return;
    const fn = (e: L.LeafletMouseEvent) => onPick?.(e.latlng);
    m.on('click', fn); return () => { m.off('click', fn); };
  }, [pickMode, onPick]);

  useEffect(() => {
    const m = mRef.current; if (!m) return;
    if (pkRef.current) { m.removeLayer(pkRef.current); pkRef.current = null; }
    if (pickedLocation?.lat != null) pkRef.current = L.marker([pickedLocation.lat, pickedLocation.lng]).addTo(m);
  }, [pickedLocation?.lat, pickedLocation?.lng]);

  useEffect(() => {
    const m = mRef.current; if (!m) return;
    mkRef.current.forEach(k => m.removeLayer(k)); mkRef.current = [];
    (markers || []).forEach(mk => {
      const col = safeColor(mk.color);
      const marker = col
      ? L.marker([mk.lat, mk.lng], { icon: L.divIcon({ className: 'ol-pin',
          html: `<div style="width:22px;height:22px;background:${col};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,
          iconAnchor: [11, 11] }) })
      : L.marker([mk.lat, mk.lng]);
      if (mk.label) marker.bindPopup(`<b>${esc(mk.label)}</b>`);
      marker.addTo(m); mkRef.current.push(marker);
    });
  }, [markers]);
  
  useEffect(() => {
    const m = mRef.current; if (!m) return;
    const svg = svgR.current;
    const visSet = new Set(visibleGroupIds);
    const ex = gRef.current;
    const cur = new Set(overlayGroups.map(g => g.id));

    Object.keys(ex).forEach(id => { if (!cur.has(id)) { m.removeLayer(ex[id].layer); delete ex[id]; } });

    overlayGroups.forEach(group => {
      if (ex[group.id]?.source === group) return;
      if (ex[group.id]) m.removeLayer(ex[group.id].layer);
      const lg = L.layerGroup(), features = [];
      (group.geojson?.features || []).forEach(f => {
        try {
          const layer = featureToLayer(f, svg);
          if (layer) { lg.addLayer(layer); features.push({ layer, feature: f }); }
        } catch (err) { console.warn('overlay feature error', err); }
      });
      ex[group.id] = { source: group, layer: lg, features };
    });

    Object.entries(ex).forEach(([id, { layer }]: [string, any]) => {
      if (visSet.has(id)) { if (!m.hasLayer(layer)) layer.addTo(m); }
      else { if (m.hasLayer(layer)) m.removeLayer(layer); }
    });

    requestAnimationFrame(() => {
      applyPatterns(m.getContainer(), ex);
      scaleTexts(m.getContainer(), m.getZoom());
    });
  }, [overlayGroups, visibleGroupIds]);

  return (
    <>
      <style>{`.ol-text-wrap,.ol-img-wrap,.ol-pin{background:transparent!important;border:none!important}`}</style>
      <div ref={cRef} style={{ height, width: '100%', borderRadius: '12px', overflow: 'hidden' }} />
    </>
  );
}
