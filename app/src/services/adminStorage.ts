import {
  listAdminStorageObjectsFn,
  setAdminStorageObjectPublishedFn,
} from '../libs/callables';

export type AdminStorageLinkRole =
  | ''
  | 'current-document'
  | 'current-thumbnail'
  | 'preserved-original'
  | 'preserved-thumbnail';

export type AdminStorageObject = {
  name: string;
  category: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  published: boolean;
  role: string;
  hasDownloadToken: boolean;
  downloadTokenRotatedAt: string;
  documentId: string;
  documentTitle: string;
  linkRole: AdminStorageLinkRole;
  recordPublished: boolean;
};

type StoragePage = {
  objects?: AdminStorageObject[];
  nextPageToken?: string;
};

export async function fetchAllAdminStorageObjects(): Promise<AdminStorageObject[]> {
  const objects: AdminStorageObject[] = [];
  const seenTokens = new Set<string>();
  let pageToken = '';

  for (let page = 0; page < 1000; page += 1) {
    const response = await listAdminStorageObjectsFn({ pageToken });
    const data = (response.data ?? {}) as StoragePage;
    if (!Array.isArray(data.objects)) throw new Error('Storage inventory returned an invalid response.');
    objects.push(...data.objects);

    const next = typeof data.nextPageToken === 'string' ? data.nextPageToken : '';
    if (!next) {
      return objects.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    }
    if (seenTokens.has(next)) throw new Error('Storage inventory pagination repeated a page token.');
    seenTokens.add(next);
    pageToken = next;
  }

  throw new Error('Storage inventory exceeded the supported pagination limit.');
}

export async function setAdminStorageObjectPublished(
  path: string,
  published: boolean,
): Promise<{
  path: string;
  published: boolean;
  hasDownloadToken: boolean;
  downloadTokensRevoked: boolean;
  downloadTokenRotatedAt: string;
}> {
  const response = await setAdminStorageObjectPublishedFn({ path, published });
  const data = response.data as {
    path?: unknown;
    published?: unknown;
    hasDownloadToken?: unknown;
    downloadTokensRevoked?: unknown;
    downloadTokenRotatedAt?: unknown;
  };
  if (data?.path !== path || data?.published !== published) {
    throw new Error('Storage visibility update returned an invalid response.');
  }
  return {
    path,
    published,
    hasDownloadToken: data.hasDownloadToken === true,
    downloadTokensRevoked: data.downloadTokensRevoked === true,
    downloadTokenRotatedAt: typeof data.downloadTokenRotatedAt === 'string'
      ? data.downloadTokenRotatedAt
      : '',
  };
}

export function isCurrentDocumentObject(object: AdminStorageObject): boolean {
  return object.linkRole === 'current-document' || object.linkRole === 'current-thumbnail';
}

export function canManageDocumentObject(object: AdminStorageObject): boolean {
  return object.name.startsWith('documents/') && !isCurrentDocumentObject(object);
}

export function storageObjectPreviewType(object: AdminStorageObject): 'PDF' | 'PNG' | 'JPG' | '' {
  if (object.contentType === 'application/pdf') return 'PDF';
  if (object.contentType === 'image/png') return 'PNG';
  if (object.contentType === 'image/jpeg') return 'JPG';
  return '';
}
