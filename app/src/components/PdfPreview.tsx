import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { loadPdf } from '../utils/pdfjs';
import { logError } from '../utils/logError';

type PdfDocument = Awaited<ReturnType<typeof loadPdf>['promise']>;

type PdfPreviewProps = {
  blob: Blob;
  docId: string;
  title: string;
};

export default function PdfPreview({ blob, docId, title }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const renderRequestRef = useRef(0);
  const navigationLockedRef = useRef(true);
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [containerWidth, setContainerWidth] = useState(900);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateWidth = () => setContainerWidth(Math.max(320, container.clientWidth));
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    let loadingTask: ReturnType<typeof loadPdf> | null = null;

    setLoading(true);
    setRendering(false);
    setError('');
    setPdf(null);
    setPageNumber(1);
    navigationLockedRef.current = true;
    canvasHostRef.current?.replaceChildren();

    blob.arrayBuffer()
      .then((buffer) => {
        if (!active) return null;
        // This component only renders the page display list to a canvas; it
        // never instantiates PDF.js' annotation/scripting viewer layers.
        loadingTask = loadPdf(new Uint8Array(buffer));
        return loadingTask.promise;
      })
      .then((loadedPdf) => {
        if (active && loadedPdf) {
          setRendering(true);
          setPdf(loadedPdf);
        }
      })
      .catch((err) => {
        if (!active) return;
        navigationLockedRef.current = false;
        setError('Could not render this PDF.');
        logError(err, 'PdfPreview-load', { docId });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      void loadingTask?.destroy();
    };
  }, [blob, docId]);

  useEffect(() => {
    if (!pdf || !canvasHostRef.current) return;
    const requestId = ++renderRequestRef.current;
    let active = true;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    navigationLockedRef.current = true;
    setRendering(true);
    setError('');
    pdf.getPage(pageNumber)
      .then((page) => {
        if (!active || requestId !== renderRequestRef.current || !canvasHostRef.current) return null;
        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(240, containerWidth - 64);
        const cssScale = Math.min(1.6, availableWidth / baseViewport.width);
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: cssScale * pixelRatio });
        const renderCanvas = document.createElement('canvas');
        renderCanvas.width = Math.floor(viewport.width);
        renderCanvas.height = Math.floor(viewport.height);
        // Context attributes are fixed by the first getContext call. Match
        // PDF.js' non-HWA default here so it is not silently overridden by
        // creating a GPU-backed canvas before page.render initializes it.
        const renderContext = renderCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
        if (!renderContext) throw new Error('Canvas rendering is unavailable.');

        // Each request gets a new, detached canvas. Keep the previous canvas
        // hidden while this one renders, then replace the DOM node atomically;
        // PDF.js never paints into a canvas that is visible or reused.
        renderTask = page.render({
          canvas: renderCanvas,
          canvasContext: renderContext,
          viewport,
          background: '#ffffff',
        });
        return renderTask.promise.then(() => {
          if (!active || requestId !== renderRequestRef.current || !canvasHostRef.current) return;
          renderCanvas.className = 'block max-w-full bg-white shadow-lg';
          renderCanvas.style.width = `${Math.floor(viewport.width / pixelRatio)}px`;
          renderCanvas.style.height = `${Math.floor(viewport.height / pixelRatio)}px`;
          renderCanvas.setAttribute('role', 'img');
          renderCanvas.setAttribute('aria-label', `Page ${pageNumber} of ${title}`);
          canvasHostRef.current.replaceChildren(renderCanvas);
        });
      })
      .catch((err) => {
        if (!active || requestId !== renderRequestRef.current || err?.name === 'RenderingCancelledException') return;
        setError('Could not render this PDF page.');
        logError(err, 'PdfPreview-render', { docId, pageNumber });
      })
      .finally(() => {
        if (active && requestId === renderRequestRef.current) {
          navigationLockedRef.current = false;
          setRendering(false);
        }
      });

    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [containerWidth, docId, pageNumber, pdf, title]);

  const pageCount = pdf?.numPages || 0;
  const busy = loading || rendering;

  const showPage = (nextPage: number) => {
    if (!pdf || busy || navigationLockedRef.current || nextPage === pageNumber) return;
    if (nextPage < 1 || nextPage > pageCount) return;
    // Lock synchronously so a double click cannot enqueue two page renders
    // before React updates the disabled navigation controls.
    navigationLockedRef.current = true;
    setRendering(true);
    setPageNumber(nextPage);
  };

  return (
    <div ref={containerRef} className="h-full w-full overflow-auto rounded-lg bg-gray-200" role="document"
      aria-label={`${title} PDF preview`} aria-busy={busy}>
      {pdf && (
        <div className="sticky top-0 z-10 flex items-center justify-center gap-4 border-b border-gray-300 bg-white px-4 py-2 shadow-sm">
          <button
            type="button"
            onClick={() => showPage(pageNumber - 1)}
            disabled={busy || pageNumber <= 1}
            className="rounded-lg p-2 text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Previous PDF page"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <span className="min-w-28 text-center text-sm font-medium text-gray-700" aria-live="polite">
            Page {pageNumber} of {pageCount}
          </span>
          <button
            type="button"
            onClick={() => showPage(pageNumber + 1)}
            disabled={busy || pageNumber >= pageCount}
            className="rounded-lg p-2 text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="Next PDF page"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      )}

      {error && <p className="m-4 rounded-lg bg-red-50 p-4 text-center text-sm font-medium text-red-600" role="alert">{error}</p>}
      <div className="relative flex min-h-80 justify-center p-6 sm:p-8" role="group" aria-label="PDF page display">
        <div ref={canvasHostRef} className={`flex w-full justify-center ${busy || error ? 'invisible' : ''}`}
          aria-hidden={busy || !!error} />
        {busy && (
          <div className="absolute inset-6 flex items-center justify-center rounded-xl bg-white/95 text-gray-700 shadow-sm sm:inset-8">
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-sm font-medium" role="status" aria-live="polite">
              <Loader2 size={32} className="animate-spin text-teal-600" aria-hidden="true" />
              {loading ? 'Loading PDF…' : `Rendering page ${pageNumber}…`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
