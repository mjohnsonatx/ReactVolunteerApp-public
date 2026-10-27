// components/user/pages/DocumentsPage.jsx
import { FileText } from 'lucide-react';
import { useApp } from '../../../context/AppContext';
import StorageImage from '../../shared/StorageImage';
import AppLink from '../../shared/AppLink';
import { pathForPage } from '../../../router/routes';

export default function DocumentsPage() {
  const { publicDocs } = useApp();

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2"><FileText className="text-teal-600" />Documents</h2>
      {publicDocs.length === 0
        ? <p className="text-gray-400 text-center py-12">No documents posted yet.</p>
        : <div className="grid sm:grid-cols-2 gap-4">{publicDocs.map(d => (
          <AppLink key={d.id} to={pathForPage('documentDetail', { documentId: d.id })}
               className="text-left flex gap-3 p-4 border border-gray-100 rounded-xl hover:border-teal-200">
              {d.thumbnailPath
                ? <StorageImage path={d.thumbnailPath} alt="" className="w-20 h-20 object-cover rounded-lg flex-shrink-0" />
                : <div className="w-20 h-20 rounded-lg bg-red-50 flex items-center justify-center text-red-500 flex-shrink-0"><FileText size={28} /></div>}
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-xs">{d.type}</span>
                  <span className="font-medium text-gray-800 truncate">{d.title || d.name}</span>
                </div>
                {d.notes && <p className="text-sm text-gray-500 line-clamp-3">{d.notes}</p>}
                <span className="text-xs text-gray-400">{d.size}</span>
              </div>
            </AppLink>
          ))}</div>}
    </div>
  );
}
