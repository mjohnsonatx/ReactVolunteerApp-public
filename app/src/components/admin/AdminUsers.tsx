// components/admin/AdminUsers.tsx
import { useMemo, useState } from 'react';
import { Users, Search, ChevronRight, Shield } from 'lucide-react';
import { useApp } from '@runtime/app-context';

function joinedLabel(joinDate: any) {
  const date = joinDate?.toDate ? joinDate.toDate() : joinDate ? new Date(joinDate) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : '—';
}

export default function AdminUsers() {
  const { allUsers, openProfileForUser } = useApp();
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const sorted = [...allUsers].sort((a, b) =>
      (a.userName || a.email || '').localeCompare(b.userName || b.email || '')
    );
    if (!query) return sorted;
    return sorted.filter(u =>
      [u.email, u.userName, u.role].some(v => (v || '').toString().toLowerCase().includes(query))
    );
  }, [allUsers, query]);

  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
      <div className="px-6 py-4 border-b flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Users className="text-teal-600" />
          <h2 className="text-xl font-bold text-gray-800">Registered Users ({allUsers.length})</h2>
        </div>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            aria-label="Search users"
            placeholder="Search by username or email"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full sm:w-72 pl-9 pr-3 py-2 rounded-lg border border-gray-200 focus:border-teal-500 outline-none text-sm"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 text-gray-600 text-sm">
            <tr>
              <th className="px-6 py-3 text-left">Username</th>
              <th className="px-6 py-3 text-left">Email</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3 text-left">Joined</th>
              <th className="px-6 py-3 text-right">Manage</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map(u => (
              <tr
                key={u.id}
                onClick={() => openProfileForUser(u.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openProfileForUser(u.id); } }}
                className="hover:bg-teal-50/40 cursor-pointer focus:bg-teal-50 focus:outline-none"
              >
                <td className="px-6 py-3 text-gray-600">{u.userName ? `@${u.userName}` : '—'}</td>
                <td className="px-6 py-3 text-gray-600 break-all">{u.email || '—'}</td>
                <td className="px-6 py-3">
                  {u.moderated ? (
                    <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                      <Shield size={10} /> Moderated
                    </span>
                  ) : (
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">Active</span>
                  )}
                  {u.role === 'admin' && (
                    <span className="ml-1 inline-flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      <Shield size={10} /> Admin
                    </span>
                  )}
                </td>
                <td className="px-6 py-3 text-gray-500 text-sm">{joinedLabel(u.joinDate)}</td>
                <td className="px-6 py-3 text-right">
                  <span className="inline-flex items-center gap-1 text-teal-600 text-sm">
                    Profile <ChevronRight size={14} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {allUsers.length === 0 && <p className="text-gray-400 text-center py-12">No registered users yet.</p>}
        {allUsers.length > 0 && filtered.length === 0 && (
          <p className="text-gray-400 text-center py-12">No users match "{search}".</p>
        )}
      </div>
    </div>
  );
}
