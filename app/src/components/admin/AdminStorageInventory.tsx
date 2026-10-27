import { useCallback, useEffect, useRef, useState } from 'react';
import { Database, Eye, Loader, RefreshCw } from 'lucide-react';
import { callableErrorMessage } from '../../libs/callables';
import {
  canManageDocumentObject,
  fetchAllAdminStorageObjects,
  isCurrentDocumentObject,
  setAdminStorageObjectPublished,
  storageObjectPreviewType,
  type AdminStorageObject,
} from '../../services/adminStorage';

type Props = {
  onPreview: (document: Record<string, unknown>) => void;
};

function sizeLabel(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return 'Unknown size';
  if (sizeBytes >= 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  if (sizeBytes >= 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${sizeBytes} B`;
}

function linkLabel(object: AdminStorageObject): string {
  if (object.linkRole === 'current-document') return 'Current document';
  if (object.linkRole === 'current-thumbnail') return 'Current thumbnail';
  if (object.linkRole === 'preserved-original') return 'Preserved original';
  if (object.linkRole === 'preserved-thumbnail') return 'Preserved thumbnail';
  if (object.name.startsWith('documents/')) return 'Untracked document object';
  return 'No document record';
}

function accessLabel(object: AdminStorageObject): string {
  if (!object.name.startsWith('documents/')) return 'Path-rule managed';
  if (object.published) return 'Public';
  if (object.downloadTokenRotatedAt) return 'Private; prior links revoked';
  if (object.hasDownloadToken) return 'Private metadata; existing share link';
  return 'Private';
}

function previewDocument(object: AdminStorageObject) {
  const type = storageObjectPreviewType(object);
  const name = object.name.split('/').at(-1) || object.name;
  return {
    id: `storage:${object.name}`,
    title: object.documentTitle || name,
    name,
    type,
    storagePath: object.name,
    notes: `Storage object: ${object.name}`,
  };
}

export default function AdminStorageInventory({ onPreview }: Props) {
  const [objects, setObjects] = useState<AdminStorageObject[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutatingPath, setMutatingPath] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const result = await fetchAllAdminStorageObjects();
      if (requestId.current === id) setObjects(result);
    } catch (cause) {
      if (requestId.current === id) {
        setError(callableErrorMessage(cause, cause instanceof Error ? cause.message : 'Could not load Storage inventory.'));
      }
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => { requestId.current += 1; };
  }, [refresh]);

  const setPublished = async (object: AdminStorageObject) => {
    const next = !object.published;
    if (next && !window.confirm('Publish this Storage object directly? It may not have a visible document record.')) return;
    setMutatingPath(object.name);
    setError('');
    setNotice('');
    try {
      const updated = await setAdminStorageObjectPublished(object.name, next);
      setObjects(current => current.map(item => item.name === object.name ? {
        ...item,
        published: updated.published,
        hasDownloadToken: updated.hasDownloadToken,
        downloadTokenRotatedAt: updated.downloadTokenRotatedAt,
      } : item));
      setNotice(next
        ? `Published ${object.name}.`
        : updated.downloadTokensRevoked
          ? `Made ${object.name} private and revoked its previous Firebase download links.`
          : `Made ${object.name} private.`);
    } catch (cause) {
      setError(callableErrorMessage(cause, cause instanceof Error ? cause.message : 'Could not update Storage visibility.'));
    } finally {
      setMutatingPath('');
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-lg" aria-labelledby="storage-inventory-heading">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-6 py-4">
        <div>
          <h2 id="storage-inventory-heading" className="flex items-center gap-3 text-xl font-bold text-gray-800">
            <Database className="text-indigo-600" />Storage bucket ({objects.length})
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Every object in the default Firebase Storage bucket is listed here, including files without a current document record.
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={loading || !!mutatingPath}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh all
        </button>
      </div>

      {(error || notice) && (
        <div role={error ? 'alert' : 'status'} className={`m-4 rounded-lg border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-teal-200 bg-teal-50 text-teal-800'}`}>
          {error || notice}
        </div>
      )}

      {loading && objects.length === 0 ? (
        <div className="flex items-center justify-center gap-2 px-6 py-10 text-sm text-gray-600" role="status">
          <Loader size={18} className="animate-spin" />Loading every Storage object…
        </div>
      ) : objects.length === 0 ? (
        <p className="px-6 py-10 text-center text-sm text-gray-500">The Storage bucket is empty.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-gray-50 text-sm text-gray-600">
              <tr>
                <th className="px-5 py-3 text-left">Object path</th>
                <th className="px-5 py-3 text-left">Document link</th>
                <th className="px-5 py-3 text-left">Access</th>
                <th className="px-5 py-3 text-left">Type / size</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {objects.map(object => {
                const previewType = storageObjectPreviewType(object);
                const manageable = canManageDocumentObject(object);
                const busy = mutatingPath === object.name;
                return (
                  <tr key={object.name} className="align-top hover:bg-gray-50">
                    <td className="max-w-lg px-5 py-3">
                      <p className="break-all font-mono text-xs text-gray-800">{object.name}</p>
                      <span className="mt-1 inline-block rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{object.category}</span>
                    </td>
                    <td className="px-5 py-3 text-sm">
                      <p className="font-medium text-gray-800">{linkLabel(object)}</p>
                      {object.documentTitle && <p className="mt-1 text-xs text-gray-500">{object.documentTitle}</p>}
                    </td>
                    <td className="px-5 py-3 text-sm">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                        object.published ? 'bg-emerald-100 text-emerald-700'
                          : object.hasDownloadToken && !object.downloadTokenRotatedAt ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-700'
                      }`}>{accessLabel(object)}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">
                      <p>{object.contentType || 'Unknown type'}</p>
                      <p className="mt-1 text-xs">{sizeLabel(object.sizeBytes)}</p>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {previewType && (
                          <button type="button" onClick={() => onPreview(previewDocument(object))}
                            aria-label={`Preview ${object.name}`}
                            className="inline-flex rounded-lg p-2 text-teal-600 hover:bg-teal-50">
                            <Eye size={16} />
                          </button>
                        )}
                        {manageable ? (
                          <button type="button" onClick={() => setPublished(object)} disabled={!!mutatingPath}
                            className={`rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${object.published ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
                            {busy ? 'Updating…' : object.published ? 'Make private' : 'Make public'}
                          </button>
                        ) : isCurrentDocumentObject(object) ? (
                          <span className="self-center text-xs text-gray-500">Managed above</span>
                        ) : (
                          <span className="self-center text-xs text-gray-500">Rule-managed</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
