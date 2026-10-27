/**
 * Pure helpers for extracting legend metadata from overlay GeoJSON.
 * Used by both admin and public-facing legend components.
 */

export interface LegendItem {
  title: string;
  type: string;
  stroke: string;
  fill: string;
  strokeStyle: string;
  strokeWidth: number;
  fillPattern: string;
  textColor?: string;
  textBg?: string;
}

/**
 * Extracts deduplicated legend items from an overlay group object.
 * Handles both string and pre-parsed geojson fields.
 */
export function extractLegend(overlay: Record<string, any>): LegendItem[] {
  let geojson = overlay.geojson;
  if (typeof geojson === 'string') {
    try { geojson = JSON.parse(geojson); } catch { return []; }
  }
  if (!geojson) return [];

  const raw: LegendItem[] =
    geojson.context?.legend?.items?.length
      ? geojson.context.legend.items
      : (geojson.features || [])
          .filter((f: any) => f.properties?.legendTitle)
          .map((f: any) => ({
            title:       f.properties.legendTitle,
            type:        f.properties.type || f.geometry?.type || '?',
            stroke:      f.properties.stroke      || f.properties.strokeHex || '#999',
            fill:        f.properties.fill         || f.properties.fillHex   || 'transparent',
            strokeStyle: f.properties.strokeStyle  || 'solid',
            strokeWidth: f.properties.strokeWidth  || 3,
            fillPattern: f.properties.fillPattern  || 'solid',
            textColor:   f.properties.textColor,
            textBg:      f.properties.textBg,
          }));

  const seen = new Set<string>();
  return raw.filter(it => {
    const key = `${it.title}|${it.stroke}|${it.fill}|${it.fillPattern}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const TYPE_LABELS: Record<string, string> = {
  polyline: 'lines', LineString: 'lines',
  polygon: 'polygons', Polygon: 'polygons',
  circle: 'circles',
  marker: 'markers', Point: 'markers',
  text: 'labels',
  image: 'images',
};

export interface FeatureBreakdown {
  total: number;
  counts: { label: string; count: number }[];
}

/**
 * Counts features grouped by display type.
 */
export function countFeatures(overlay: Record<string, any>): FeatureBreakdown {
  let geojson = overlay.geojson;
  if (typeof geojson === 'string') {
    try { geojson = JSON.parse(geojson); } catch { return { total: 0, counts: [] }; }
  }
  if (!geojson?.features) return { total: 0, counts: [] };

  const raw: Record<string, number> = {};
  for (const f of geojson.features) {
    const type = f.properties?.type || f.geometry?.type || 'unknown';
    raw[type] = (raw[type] || 0) + 1;
  }

  const counts = Object.entries(raw).map(([type, count]) => ({
    label: TYPE_LABELS[type] || type,
    count,
  }));

  return { total: geojson.features.length, counts };
}