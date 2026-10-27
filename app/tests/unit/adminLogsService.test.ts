import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  pages: {} as Record<string, any[][]>,
  getDocs: vi.fn(),
  download: vi.fn(),
  recordExport: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, source: string) => ({ kind: 'collection', source }),
  documentId: () => ({ kind: 'documentId' }),
  limit: (size: number) => ({ kind: 'limit', size }),
  orderBy: (field: unknown) => ({ kind: 'orderBy', field }),
  startAfter: (cursor: unknown) => ({ kind: 'startAfter', cursor }),
  query: (...parts: any[]) => ({ parts }),
  getDocs: h.getDocs,
}));
vi.mock('../../src/firebase', () => ({ db: {} }));
vi.mock('../../src/services/mailingListExport', () => ({ downloadCsv: h.download }));
vi.mock('../../src/libs/callables', () => ({ recordAdminLogsExportFn: h.recordExport }));

import { exportAllAdminLogs, fetchAllAdminLogs } from '../../src/services/adminLogs';

function docs(source: string, start: number, count: number, type: 'action' | 'error') {
  return Array.from({ length: count }, (_, offset) => {
    const index = start + offset;
    return {
      id: `${source}-${index.toString().padStart(4, '0')}`,
      data: () => type === 'action'
        ? { action: 'event.update', summary: `Action ${index}`, createdAt: index }
        : { context: 'event-load', message: `Error ${index}`, createdAt: index },
    };
  });
}

beforeEach(() => {
  h.download.mockReset();
  h.recordExport.mockReset().mockResolvedValue({ data: { ok: true } });
  h.getDocs.mockReset().mockImplementation(async (request: any) => {
    const collectionPart = request.parts.find((part: any) => part.kind === 'collection');
    const hasCursor = request.parts.some((part: any) => part.kind === 'startAfter');
    const page = h.pages[collectionPart.source][hasCursor ? 1 : 0] || [];
    return { docs: page, size: page.length };
  });
  h.pages = {
    adminAuditLogs: [docs('audit', 1, 500, 'action'), docs('audit', 501, 2, 'action')],
    errorLogs: [docs('error', 1, 1, 'error')],
  };
});

describe('complete administrator log retrieval', () => {
  it('paginates through every audit and error document', async () => {
    const logs = await fetchAllAdminLogs();
    expect(logs).toHaveLength(503);
    expect(h.getDocs).toHaveBeenCalledTimes(3);
    expect(logs[0].summary).toBe('Action 502');
    expect(logs.at(-1)?.summary).toBe('Error 1');
  });

  it('audits the export before downloading the complete CSV', async () => {
    const result = await exportAllAdminLogs();
    expect(h.recordExport).toHaveBeenCalledWith({});
    expect(h.recordExport.mock.invocationCallOrder[0]).toBeLessThan(h.getDocs.mock.invocationCallOrder[0]);
    expect(h.download).toHaveBeenCalledTimes(1);
    expect(result.count).toBe(503);
    expect(result.filename).toMatch(/^watershedcrew-admin-logs-.*Z\.csv$/);
  });
});
