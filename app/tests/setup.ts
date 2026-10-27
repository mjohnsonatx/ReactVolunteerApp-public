import '@testing-library/jest-dom/vitest';
import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  // The app is history-routed now; reset the URL so each test starts at "/".
  if (typeof window !== 'undefined' && window.history) {
    window.history.replaceState({}, '', '/');
  }
});

// jsdom doesn't implement these; Leaflet/maps touch them.
global.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    media: '',
    onchange: null,
    addListener(){},
    removeListener(){},
    addEventListener(){},
    removeEventListener(){},
    dispatchEvent: () => true,
  });
}
if (!global.DOMMatrix) global.DOMMatrix = class DOMMatrix {} as any;
if (!global.Path2D) global.Path2D = class Path2D {} as any;
if (!global.ImageData) global.ImageData = class ImageData {} as any;
if (!URL.createObjectURL) URL.createObjectURL = vi.fn(() => 'blob:http://localhost/test-doc');
if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
