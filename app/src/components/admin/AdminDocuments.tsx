// components/admin/AdminDocuments.jsx
import { AlertTriangle, Upload, FileText, Eye, CheckCircle, XCircle, Trash2, Loader } from 'lucide-react';
import { useApp } from '@runtime/app-context';
import { LIMITS } from '../../utils/sanitize';
import AdminStorageInventory from './AdminStorageInventory';

export default function AdminDocuments() {
  const {
    allUserDocs, handleAdminUpload, adminUploadForm, setAdminUploadForm,
    adminUploadError, setAdminUploadError, adminUploadLoading,
    approveDoc, rejectDoc, setViewingDoc, togglePublishDoc, deleteDocRecord,
    docModerationError,
  } = useApp();

  const pending = allUserDocs.filter(d => d.status === 'pending');

  return (
    <div className="space-y-6">
      {docModerationError && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center gap-2">
          <AlertTriangle size={18} className="shrink-0" />
          <span className="text-sm">{docModerationError}</span>
        </div>
      )}
      {pending.length > 0 && (
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b bg-orange-50 flex items-center gap-3"><AlertTriangle className="text-orange-500" /><h2 className="text-xl font-bold text-orange-800">Pending Review ({pending.length})</h2></div>
          <div className="p-4 space-y-3">{pending.map(d=>(
            <div key={d.id} className="flex items-center justify-between p-4 border border-orange-200 bg-orange-50/50 rounded-xl">
              <div className="flex items-center gap-4"><div><p className="font-medium text-gray-800">{d.userName}</p><p className="text-gray-500 text-sm">{d.userEmail}</p></div><div className="flex items-center gap-2"><span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-xs">{d.type}</span><span className="text-gray-700">{d.name}</span></div></div>
              <div className="flex gap-2"><button type="button" onClick={()=>setViewingDoc(d)} aria-label="Preview pending document" className="text-teal-600 hover:bg-teal-50 p-2 rounded-lg"><Eye size={18}/></button><button onClick={()=>approveDoc(d.id)} className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-lg"><CheckCircle size={18}/></button><button onClick={()=>rejectDoc(d.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg"><XCircle size={18}/></button></div>
            </div>
          ))}</div>
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center gap-3"><Upload className="text-emerald-600" /><h2 className="text-xl font-bold text-gray-800">Upload Document</h2></div>
        <form onSubmit={handleAdminUpload} className="p-6 space-y-3">
          <div className="grid md:grid-cols-2 gap-3">
            <input type="text" placeholder="Title" maxLength={LIMITS.name} value={adminUploadForm.title}
              onChange={e => { setAdminUploadError(''); setAdminUploadForm({ ...adminUploadForm, title: e.target.value }); }}
              className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-emerald-500 outline-none" />
            <input type="file" accept=".pdf,.jpg,.jpeg,.png"
              onChange={e => { setAdminUploadError(''); setAdminUploadForm({ ...adminUploadForm, file: e.target.files[0] || null }); }}
              className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100" />
          </div>
          <textarea placeholder="Notes / description (optional)" maxLength={LIMITS.comment} rows={2} value={adminUploadForm.notes}
            onChange={e => { setAdminUploadError(''); setAdminUploadForm({ ...adminUploadForm, notes: e.target.value }); }}
            className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:border-emerald-500 outline-none" />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={adminUploadForm.publish}
              onChange={e => setAdminUploadForm({ ...adminUploadForm, publish: e.target.checked })} />
            Publish to public Documents tab immediately
          </label>
          {adminUploadError && <p className="text-red-500 text-sm bg-red-50 px-4 py-2 rounded-lg">{adminUploadError}</p>}
          <button type="submit" disabled={adminUploadLoading}
            className={`px-6 py-2 rounded-lg font-medium text-white ${adminUploadLoading ? 'bg-gray-300' : 'bg-emerald-500 hover:bg-emerald-600'}`}>
            {adminUploadLoading ? <span className="flex items-center gap-2"><Loader size={16} className="animate-spin" />Uploading…</span> : 'Upload'}
          </button>
        </form>
      </div>
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center gap-3"><FileText className="text-teal-600" /><h2 className="text-xl font-bold text-gray-800">Document records ({allUserDocs.length})</h2></div>
        <table className="w-full"><thead className="bg-gray-50 text-gray-600 text-sm"><tr><th className="px-6 py-3 text-left">User</th><th className="px-6 py-3 text-left">Document</th><th className="px-6 py-3 text-left">Status</th><th className="px-6 py-3 text-right">Actions</th></tr></thead>
        <tbody className="divide-y">{allUserDocs.map(d=>(
          <tr key={d.id} className="hover:bg-gray-50">
            <td className="px-6 py-3">
              <p className="font-medium">{d.userName}</p>
              <p className="text-gray-500 text-sm">{d.userEmail}</p>
            </td>
            <td className="px-6 py-3">
              <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded text-xs mr-2">{d.type}</span>{d.name}
            </td>
            <td className="px-6 py-3">
              <span className={`px-2 py-1 rounded-full text-xs ${
                d.status === 'approved' ? 'bg-emerald-100 text-emerald-700'
                : d.status === 'rejected' ? 'bg-red-100 text-red-700'
                : 'bg-orange-100 text-orange-700'}`}>{d.status}</span>
            </td>
            <td className="px-6 py-3 text-right space-x-1">
              <button onClick={() => setViewingDoc(d)}
                className="inline-flex text-teal-600 hover:bg-teal-50 p-2 rounded-lg">
                <Eye size={16}/>
              </button>
              {d.status === 'approved' && d.visibility === 'public' && (
                <button onClick={() => togglePublishDoc(d)}
                  className={`px-2 py-1 rounded text-xs ${
                    d.published ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {d.published ? 'Listed' : 'List publicly'}
                </button>
              )}
              <button onClick={() => deleteDocRecord(d)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg">
                <Trash2 size={16}/>
              </button>
            </td>
          </tr>
        ))}</tbody></table>
        {allUserDocs.length===0 && <p className="text-gray-400 text-center py-8">No uploads yet.</p>}
      </div>
      <AdminStorageInventory onPreview={setViewingDoc} />
    </div>
  );
}
