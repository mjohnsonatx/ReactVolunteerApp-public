import { loadPdf } from './pdfjs';

const MAX = 320;
const toBlob = (canvas: HTMLCanvasElement) => new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.7));

async function imageThumb(file: File) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')?.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return toBlob(c);
}

async function pdfThumb(file: File) {
  const buf = await file.arrayBuffer();
  const loadingTask = loadPdf(buf);
  try {
    const pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1, MAX / Math.max(base.width, base.height)) * 2;
    const v = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = v.width; c.height = v.height;
    const ctx = c.getContext('2d', { alpha: false, willReadFrequently: true });
    if (!ctx) return null;
    await page.render({ canvas: c, canvasContext: ctx, viewport: v }).promise;
    return await toBlob(c);
  } finally {
    await loadingTask.destroy();
  }
}

export async function makeThumbnail(file: File): Promise<Blob | null> {
  try {
    if (file.type.startsWith('image/')) return await imageThumb(file);
    if (file.type === 'application/pdf') return await pdfThumb(file);
  } catch (e) {
    console.warn('thumbnail generation failed', e);
  }
  return null;
}
