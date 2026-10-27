import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  setPublished: vi.fn(),
}));

vi.mock('../../src/libs/callables', () => ({
  listAdminStorageObjectsFn: mocks.list,
  setAdminStorageObjectPublishedFn: mocks.setPublished,
}));

import {
  canManageDocumentObject,
  fetchAllAdminStorageObjects,
  setAdminStorageObjectPublished,
  storageObjectPreviewType,
  type AdminStorageObject,
} from '../../src/services/adminStorage';

function object(overrides: Partial<AdminStorageObject>): AdminStorageObject {
  return {
    name: 'documents/user/file.pdf',
    category: 'documents',
    contentType: 'application/pdf',
    sizeBytes: 100,
    createdAt: '',
    updatedAt: '',
    published: false,
    role: '',
    hasDownloadToken: false,
    downloadTokenRotatedAt: '',
    documentId: '',
    documentTitle: '',
    linkRole: '',
    recordPublished: false,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.list.mockReset();
  mocks.setPublished.mockReset();
});

describe('admin Storage inventory service', () => {
  it('loads every page and sorts the combined bucket inventory', async () => {
    const first = object({ name: 'siteContent/profile.png', category: 'siteContent', contentType: 'image/png' });
    const second = object({ name: 'documents/user/archive.pdf' });
    mocks.list
      .mockResolvedValueOnce({ data: { objects: [first], nextPageToken: 'next-page' } })
      .mockResolvedValueOnce({ data: { objects: [second], nextPageToken: '' } });

    await expect(fetchAllAdminStorageObjects()).resolves.toEqual([second, first]);
    expect(mocks.list).toHaveBeenNthCalledWith(1, { pageToken: '' });
    expect(mocks.list).toHaveBeenNthCalledWith(2, { pageToken: 'next-page' });
  });

  it('rejects a repeated page token instead of looping forever', async () => {
    mocks.list
      .mockResolvedValueOnce({ data: { objects: [], nextPageToken: 'repeat' } })
      .mockResolvedValueOnce({ data: { objects: [], nextPageToken: 'repeat' } });

    await expect(fetchAllAdminStorageObjects()).rejects.toThrow(/repeated a page token/i);
  });

  it('validates visibility updates and object capabilities', async () => {
    mocks.setPublished.mockResolvedValue({
      data: {
        path: 'documents/user/archive.pdf',
        published: false,
        hasDownloadToken: true,
        downloadTokensRevoked: true,
        downloadTokenRotatedAt: '2026-10-15T12:00:00.000Z',
      },
    });
    await expect(setAdminStorageObjectPublished('documents/user/archive.pdf', false)).resolves.toEqual({
      path: 'documents/user/archive.pdf',
      published: false,
      hasDownloadToken: true,
      downloadTokensRevoked: true,
      downloadTokenRotatedAt: '2026-10-15T12:00:00.000Z',
    });

    expect(canManageDocumentObject(object({ linkRole: 'preserved-original' }))).toBe(true);
    expect(canManageDocumentObject(object({ linkRole: 'current-document' }))).toBe(false);
    expect(canManageDocumentObject(object({ name: 'events/event/image.jpg', category: 'events' }))).toBe(false);
    expect(storageObjectPreviewType(object({ contentType: 'image/jpeg' }))).toBe('JPG');
    expect(storageObjectPreviewType(object({ contentType: 'image/webp' }))).toBe('');
  });
});
