export * from '@watershed/shared/src/geojson';

// const MAX_FEATURES = 2000;

// const ALLOWED_PROPS = [
//   'type','stroke','fill','strokeHex','fillHex','strokeWidth','fillOpacity',
//   'strokeStyle','fillPattern','patternSize','legendTitle','text','textSize',
//   'textColor','textBg','textBaseZoom','circleRadius','circleCenter',
//   'imageTitle','imageRef','id',
// ];
// const VALID_GEOMETRY = ['Point','LineString','Polygon','MultiPolygon','MultiLineString'];

// function scrubStrings(value) {
//   if (typeof value === 'string') {
//     return value
//       .replace(/<\/?[a-z][\s\S]*?>/gi, '')            // strip HTML tags
//       .replace(/(javascript|data|vbscript):/gi, '');  // neutralize dangerous URI schemes
//   }
//   if (Array.isArray(value)) return value.map(scrubStrings);
//   if (value && typeof value === 'object') {
//     const out = {};
//     for (const k of Object.keys(value)) out[k] = scrubStrings(value[k]);
//     return out;
//   }
//   return value; // numbers (coordinates!), booleans, null pass through untouched
// }

// // Throws a human-readable Error on bad input; returns a clean object on success.
// export function sanitizeGeoJSON(raw) {
//   if (!raw || typeof raw !== 'object')      throw new Error('Invalid GeoJSON.');
//   if (raw.type !== 'FeatureCollection')     throw new Error('Expected a GeoJSON FeatureCollection.');
//   if (!Array.isArray(raw.features) || !raw.features.length) throw new Error('No features found in this file.');
//   if (raw.features.length > MAX_FEATURES)   throw new Error(`Too many features (max ${MAX_FEATURES}).`);

//   const features = raw.features
//     .filter(f => f && f.geometry && VALID_GEOMETRY.includes(f.geometry.type))
//     .map(f => {
//       const props = {};
//       const src = scrubStrings(f.properties || {});
//       for (const k of ALLOWED_PROPS) if (k in src) props[k] = src[k];
//       return { type: 'Feature', geometry: f.geometry, properties: props };
//     });

//   if (!features.length) throw new Error('No valid features found.');

//   let context;
//   if (raw.context && typeof raw.context === 'object') {
//     context = {
//       summary: typeof raw.context.summary === 'string' ? raw.context.summary.slice(0, 200) : undefined,
//       legend:  raw.context.legend && typeof raw.context.legend === 'object' ? raw.context.legend : undefined,
//     };
//   }
//   return { type: 'FeatureCollection', context, features };
// }