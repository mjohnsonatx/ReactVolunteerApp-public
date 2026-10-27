import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('pdfjs-dist', () => ({
  version: 'test-version',
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: mocks.getDocument,
}));

vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '/pdf.worker.test.mjs' }));
vi.mock('../../src/utils/logError', () => ({ logError: mocks.logError }));

import PdfPreview from '../../src/components/PdfPreview';

type DeferredRender = {
  promise: Promise<void>;
  resolve: () => void;
  cancel: ReturnType<typeof vi.fn>;
  canvas?: HTMLCanvasElement;
};

function deferredRender(): DeferredRender {
  let resolve = () => {};
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve, cancel: vi.fn() };
}

describe('PdfPreview rendering', () => {
  const contexts = new Map<HTMLCanvasElement, any>();
  let getContextSpy: ReturnType<typeof vi.spyOn>;
  let clientWidthSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    contexts.clear();
    clientWidthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
      if (!contexts.has(this)) {
        contexts.set(this, {
          setTransform: vi.fn(),
          fillRect: vi.fn(),
          drawImage: vi.fn(),
          fillStyle: '',
        });
      }
      return contexts.get(this);
    } as typeof HTMLCanvasElement.prototype.getContext);
  });

  afterEach(() => {
    getContextSpy.mockRestore();
    clientWidthSpy.mockRestore();
  });

  it('locks navigation while rendering and atomically swaps fresh page canvases', async () => {
    const tasks = [deferredRender(), deferredRender(), deferredRender()];
    const renderedCanvases: HTMLCanvasElement[] = [];
    let renderIndex = 0;
    const getPage = vi.fn(async () => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
      render: ({ canvas }: { canvas: HTMLCanvasElement }) => {
        const task = tasks[renderIndex++];
        task.canvas = canvas;
        renderedCanvases.push(canvas);
        return { promise: task.promise, cancel: task.cancel };
      },
    }));
    mocks.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 2, getPage }),
      destroy: vi.fn(),
    });
    const blob = { arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)) } as unknown as Blob;

    render(<PdfPreview blob={blob} docId="doc-1" title="Restoration plan" />);

    await waitFor(() => expect(renderedCanvases).toHaveLength(1));
    expect(mocks.getDocument).toHaveBeenCalledWith(expect.objectContaining({
      standardFontDataUrl: expect.stringContaining('/pdfjs/test-version/standard_fonts/'),
      wasmUrl: expect.stringContaining('/pdfjs/test-version/wasm/'),
      cMapUrl: expect.stringContaining('/pdfjs/test-version/cmaps/'),
      useSystemFonts: false,
      enableHWA: false,
    }));
    expect(getContextSpy).toHaveBeenCalledWith('2d', { alpha: false, willReadFrequently: true });
    expect(screen.getByRole('status')).toHaveTextContent(/rendering page 1/i);
    expect(screen.getByRole('group', { name: /pdf page display/i })).toHaveClass('p-6', 'sm:p-8');
    await act(async () => { tasks[0].resolve(); await tasks[0].promise; });

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.getByRole('img', { name: /page 1 of restoration plan/i })).toBe(tasks[0].canvas);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /next pdf page/i }));
    await waitFor(() => expect(renderedCanvases).toHaveLength(2));
    expect(screen.getByText(/page 2 of 2/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/rendering page 2/i);
    expect(screen.getByRole('button', { name: /previous pdf page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next pdf page/i })).toBeDisabled();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    // A click during rendering is ignored, so two PDF.js page renders can
    // never overlap because of rapid next/previous navigation.
    await user.click(screen.getByRole('button', { name: /previous pdf page/i }));
    expect(renderedCanvases).toHaveLength(2);

    await act(async () => { tasks[1].resolve(); await tasks[1].promise; });
    await waitFor(() => expect(screen.getByRole('img', { name: /page 2 of restoration plan/i })).toBe(tasks[1].canvas));

    await user.click(screen.getByRole('button', { name: /previous pdf page/i }));
    await waitFor(() => expect(renderedCanvases).toHaveLength(3));
    await act(async () => { tasks[2].resolve(); await tasks[2].promise; });
    await waitFor(() => expect(screen.getByRole('img', { name: /page 1 of restoration plan/i })).toBe(tasks[2].canvas));

    expect(tasks[0].canvas?.isConnected).toBe(false);
    expect(tasks[1].canvas?.isConnected).toBe(false);
    expect(tasks[2].canvas?.isConnected).toBe(true);
    expect(new Set(renderedCanvases).size).toBe(3);
  });
});
