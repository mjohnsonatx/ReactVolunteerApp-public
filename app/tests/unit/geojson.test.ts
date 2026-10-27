// tests/unit/geojson.test.js
import { describe, it, expect } from 'vitest';
import { sanitizeGeoJSON } from '../../src/utils/geojson';

describe('sanitizeGeoJSON', () => {
  const valid = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-97.7, 30.2] }, properties: { stroke: '#abc' } }],
  };

  it('accepts a well-formed FeatureCollection', () => {
    expect(() => sanitizeGeoJSON(valid)).not.toThrow();
    expect(sanitizeGeoJSON(valid).type).toBe('FeatureCollection');
  });

  it.each([
    [null, 'null'],
    [{}, 'empty object'],
    [{ type: 'Feature' }, 'wrong root type'],
    [{ type: 'FeatureCollection' }, 'missing features'],
    [{ type: 'FeatureCollection', features: 'nope' }, 'features not an array'],
    ['{"type":"FeatureCollection"}', 'string instead of object'],
    [42, 'number'],
  ])('rejects invalid input (%s)', (bad, _label) => {
    expect(() => sanitizeGeoJSON(bad)).toThrow();
  });

  it('strips/neutralizes script-bearing property values', () => {
    const dirty = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { legendTitle: '<script>alert(1)</script>' } }],
    };
    const clean = sanitizeGeoJSON(dirty);
    expect(JSON.stringify(clean)).not.toMatch(/<script/i);
  });

  it('strips script tags from nested feature properties', () => {
  const clean = sanitizeGeoJSON({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { legendTitle: '<script>alert(1)</script>', text: 'ok' } }],
  });
  expect(JSON.stringify(clean)).not.toMatch(/<script/i);
    });

    it('neutralizes javascript: URIs in properties', () => {
    const clean = sanitizeGeoJSON({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { imageRef: 'javascript:alert(1)' } }],
    });
    expect(JSON.stringify(clean)).not.toMatch(/javascript:/i);
    });

    it('preserves numeric coordinates exactly (scrubber must not touch numbers)', () => {
    const clean = sanitizeGeoJSON({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [-97.7431, 30.2672] }, properties: {} }],
    });
    expect(clean.features[0].geometry.coordinates).toEqual([-97.7431, 30.2672]);
    });
});
