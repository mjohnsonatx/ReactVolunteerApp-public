const MAX_FEATURES = 2000;

const ALLOWED_PROPS = [
  'type',
  'stroke',
  'fill',
  'strokeHex',
  'fillHex',
  'strokeWidth',
  'fillOpacity',
  'strokeStyle',
  'fillPattern',
  'patternSize',
  'legendTitle',
  'text',
  'textSize',
  'textColor',
  'textBg',
  'textBaseZoom',
  'circleRadius',
  'circleCenter',
  'imageTitle',
  'imageRef',
  'id',
] as const;

const VALID_GEOMETRY = ['Point', 'LineString', 'Polygon', 'MultiPolygon', 'MultiLineString'] as const;

type GeometryType = (typeof VALID_GEOMETRY)[number];
type UnknownRecord = Record<string, unknown>;

export type SanitizedGeometry = {
  type: GeometryType;
  [key: string]: unknown;
};

export type SanitizedFeature = {
  type: 'Feature';
  geometry: SanitizedGeometry;
  properties: SanitizedFeatureProperties;
};

export type SanitizedFeatureProperties = Record<string, unknown> & {
  type?: string;
  stroke?: string;
  fill?: string;
  strokeHex?: string;
  fillHex?: string;
  strokeWidth?: number;
  fillOpacity?: number;
  strokeStyle?: string;
  fillPattern?: string;
  patternSize?: number;
  legendTitle?: string;
  text?: string;
  textSize?: number;
  textColor?: string;
  textBg?: string;
  textBaseZoom?: number;
  circleRadius?: number;
  circleCenter?: unknown;
  imageTitle?: string;
  imageRef?: string;
  id?: string | number;
};

export type SanitizedGeoJSON = {
  type: 'FeatureCollection';
  context?: {
    summary?: string;
    legend?: UnknownRecord;
  };
  features: SanitizedFeature[];
};

type SourceFeature = UnknownRecord & {
  geometry: SanitizedGeometry;
};

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isAllowedGeometryType(value: unknown): value is GeometryType {
  return typeof value === 'string' && (VALID_GEOMETRY as readonly string[]).includes(value);
}

function isSourceFeature(value: unknown): value is SourceFeature {
  if (!isRecord(value) || !isRecord(value.geometry)) return false;
  return isAllowedGeometryType(value.geometry.type);
}

function scrubStrings(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/<\/?[a-z][\s\S]*?>/gi, '')
      .replace(/(javascript|data|vbscript):/gi, '');
  }
  if (Array.isArray(value)) return value.map(scrubStrings);
  if (isRecord(value)) {
    const out: UnknownRecord = {};
    for (const key of Object.keys(value)) out[key] = scrubStrings(value[key]);
    return out;
  }
  return value;
}

// Throws a human-readable Error on bad input; returns a clean object on success.
export function sanitizeGeoJSON(raw: unknown): SanitizedGeoJSON {
  if (!isRecord(raw)) throw new Error('Invalid GeoJSON.');
  if (raw.type !== 'FeatureCollection') throw new Error('Expected a GeoJSON FeatureCollection.');
  if (!Array.isArray(raw.features) || !raw.features.length) throw new Error('No features found in this file.');
  if (raw.features.length > MAX_FEATURES) throw new Error(`Too many features (max ${MAX_FEATURES}).`);

  const features: SanitizedFeature[] = raw.features
    .filter(isSourceFeature)
    .map((feature) => {
      const props: SanitizedFeatureProperties = {};
      const src = scrubStrings(feature.properties ?? {});
      const sourceProps = isRecord(src) ? src : {};

      for (const key of ALLOWED_PROPS) {
        if (key in sourceProps) {
          (props as Record<string, unknown>)[key] = sourceProps[key];
        }
      }

      return { type: 'Feature', geometry: feature.geometry, properties: props };
    });

  if (!features.length) throw new Error('No valid features found.');

  let context: SanitizedGeoJSON['context'];
  if (isRecord(raw.context)) {
    context = {
      summary: typeof raw.context.summary === 'string' ? raw.context.summary.slice(0, 200) : undefined,
      legend: isRecord(raw.context.legend) ? raw.context.legend : undefined,
    };
  }

  return { type: 'FeatureCollection', context, features };
}
