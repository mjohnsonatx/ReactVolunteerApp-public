import { lazy, Suspense, useEffect, useState } from 'react';
import { X, FileText, Loader, AlertTriangle } from 'lucide-react';
import { getBlob, ref } from 'firebase/storage';
import { storage } from '@runtime/firebase';
import { logError } from '../utils/logError';

const PdfPreview = lazy(() => import('./PdfPreview'));

export default function DocumentViewer({ doc, onClose }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [fileBlob, setFileBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!doc?.storagePath) {
      setError('This document is missing its storage reference.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    let url;

    (async () => {
      setLoading(true);
      setError('');
      setBlobUrl(null);
      setFileBlob(null);
      try {
        const blob = await getBlob(ref(storage, doc.storagePath));
        if (cancelled) return;
        setFileBlob(blob);
        if (['JPG', 'PNG'].includes(doc.type)) {
          url = URL.createObjectURL(blob);
          setBlobUrl(url);
        }
      } catch (err) {
        if (cancelled) return;
        setError('Could not load this document.');
        logError(err, 'DocumentViewer-load', { docId: doc.id });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc?.id, doc?.storagePath, doc?.type]);

  if (!doc) return null;
  const isPdf = doc.type === 'PDF';
  const isImg = ['JPG', 'PNG'].includes(doc.type);

  return (
    <div className="fixed inset-0 bg-black/70 z-[3000] flex flex-col" role="dialog" aria-modal="true" aria-label={doc.title || doc.name}>
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={18} className="text-teal-600 shrink-0" />
          <h3 className="font-semibold text-gray-800 truncate">
            {doc.title || doc.name}
          </h3>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5"
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-gray-100 flex items-center justify-center p-4">
        {loading && (
          <div className="flex flex-col items-center gap-3 text-white">
            <Loader size={48} className="animate-spin text-teal-400" />
            <p className="text-sm">Loading document…</p>
          </div>
        )}

        {!loading && error && (
          <div className="bg-white rounded-xl p-6 max-w-md text-center">
            <AlertTriangle size={32} className="text-red-500 mx-auto mb-2" />
            <p className="text-red-600 font-medium">{error}</p>
          </div>
        )}

        {!loading && !error && fileBlob && isPdf && (
          <Suspense fallback={<p className="text-sm text-gray-600" role="status">Preparing PDF preview…</p>}>
            <PdfPreview blob={fileBlob} docId={doc.id} title={doc.title || doc.name} />
          </Suspense>
        )}

        {!loading && !error && blobUrl && isImg && (
          <img
            src={blobUrl}
            alt={doc.title || doc.name}
            className="max-w-full max-h-full rounded-lg shadow"
          />
        )}

        {!loading && !error && fileBlob && !isPdf && !isImg && (
          <div className="bg-white rounded-xl p-6 text-center">
            <p className="text-gray-600">Preview not available for this file type.</p>
          </div>
        )}
      </div>

      {doc.notes && (
        <div className="bg-white border-t px-4 py-3 text-sm text-gray-600 max-h-32 overflow-auto">
          {doc.notes}
        </div>
      )}
    </div>
  );
}
