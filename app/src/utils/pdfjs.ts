import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

type MapWithUpsert = Map<any, any> & {
  getOrInsertComputed?: (key: any, callback: (key: any) => any) => any;
};

if (typeof (Map.prototype as MapWithUpsert).getOrInsertComputed !== 'function') {
  (Map.prototype as MapWithUpsert).getOrInsertComputed = function (key, callback) {
    if (!this.has(key)) this.set(key, callback(key));
    return this.get(key);
  };
}

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export function loadPdf(data: ArrayBuffer | Uint8Array) {
  const base = new URL(`${import.meta.env.BASE_URL}pdfjs/${pdfjsLib.version}/`, document.baseURI);
  return pdfjsLib.getDocument({
    data,
    cMapUrl: new URL('cmaps/', base).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', base).href,
    wasmUrl: new URL('wasm/', base).href,
    enableHWA: false,
    // Use the packaged fonts rather than depending on installed system fonts.
    useSystemFonts: false,
  });
}
