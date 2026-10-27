// components/admin/AdminVolunteers.jsx
import { Users, Check, X, Edit2, Trash2 } from 'lucide-react';
import { useApp } from '@runtime/app-context';

export default function AdminVolunteers() {
  const {
    volunteers, editingId, openProfileForVolunteer,
    editForm, setEditForm, saveEdit, setEditingId, startEdit, deleteVolunteer,
  } = useApp();

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      <div className="px-6 py-4 border-b flex items-center gap-3"><Users className="text-teal-600" /><h2 className="text-xl font-bold text-gray-800">Volunteers ({volunteers.length})</h2></div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 text-gray-600 text-sm"><tr><th className="px-6 py-3 text-left">Name</th><th className="px-6 py-3 text-left">Email</th><th className="px-6 py-3 text-left">Phone</th><th className="px-6 py-3 text-left">Joined</th><th className="px-6 py-3 text-right">Actions</th></tr></thead>
          <tbody className="divide-y">{volunteers.map(u => (
            <tr
              key={u.id}
              onClick={() => editingId !== u.id && openProfileForVolunteer(u)}
              className={`hover:bg-gray-50 ${editingId !== u.id ? 'cursor-pointer' : ''}`}
            >
              {editingId === u.id ? (<>
                <td className="px-6 py-3"><input value={editForm.name||''} onChange={e=>setEditForm({...editForm,name:e.target.value})} className="border rounded px-2 py-1 w-full"/></td>
                <td className="px-6 py-3"><input value={editForm.email||''} onChange={e=>setEditForm({...editForm,email:e.target.value})} className="border rounded px-2 py-1 w-full"/></td>
                <td className="px-6 py-3"><input value={editForm.phone||''} onChange={e=>setEditForm({...editForm,phone:e.target.value})} className="border rounded px-2 py-1 w-full"/></td>
                <td className="px-6 py-3 text-gray-500 text-sm">{u.joinDate?.toDate?.()?.toLocaleDateString()||'—'}</td>
                <td className="px-6 py-3 text-right space-x-2" onClick={e => e.stopPropagation()}>
                  <button onClick={saveEdit} className="text-emerald-600 hover:bg-emerald-50 p-2 rounded-lg"><Check size={18}/></button>
                  <button onClick={()=>setEditingId(null)} className="text-gray-400 hover:bg-gray-100 p-2 rounded-lg"><X size={18}/></button>
                </td>
              </>) : (<>
                <td className="px-6 py-3 font-medium text-gray-800">{u.name}</td>
                <td className="px-6 py-3 text-gray-600">{u.email}</td>
                <td className="px-6 py-3 text-gray-600">{u.phone||'—'}</td>
                <td className="px-6 py-3 text-gray-500 text-sm">{u.joinDate?.toDate?.()?.toLocaleDateString()||'—'}</td>
                <td className="px-6 py-3 text-right space-x-2" onClick={e => e.stopPropagation()}>
                  <button onClick={()=>startEdit(u)} className="text-teal-600 hover:bg-teal-50 p-2 rounded-lg">
                    <Edit2 size={18}/>
                  </button>
                  <button onClick={()=>deleteVolunteer(u.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg">
                    <Trash2 size={18}/>
                  </button>
                </td>
              </>)}
            </tr>
          ))}</tbody>
        </table>
        {volunteers.length===0 && <p className="text-gray-400 text-center py-12">No volunteers yet.</p>}
      </div>
    </div>
  );
}
