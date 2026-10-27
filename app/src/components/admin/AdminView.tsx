// components/admin/AdminView.jsx
import { Droplets, Shield, Home, Users, UserCog, Calendar, Layers, FileText, MessageSquare, Mail, Edit2, BarChart3, ScrollText } from 'lucide-react';
import { useApp } from '@runtime/app-context';
import TabBadge from '../shared/TabBadge';
import AdminDashboard from './AdminDashboard';
import AdminUsers from './AdminUsers';
import AdminVolunteers from './AdminVolunteers';
import AdminEvents from './AdminEvents';
import AdminPolls from './AdminPolls';
import AdminOverlays from './AdminOverlays';
import AdminDocuments from './AdminDocuments';
import AdminForum from './AdminForum';
import AdminMailing from './AdminMailing';
import AdminContent from './AdminContent';
import AdminLogs from './AdminLogs';
import EventFormModal from '../modals/EventFormModal';
import ImportOverlayModal from '../modals/ImportOverlayModal';
import UserProfileModal from '../modals/UserProfileModal';
import AccountMenu from '../shared/AccountMenu';

const adminTabs = [
  { id: 'dashboard', icon: Home, label: 'Dashboard' },
  { id: 'content', icon: Edit2, label: 'Site Content' },
  { id: 'users', icon: UserCog, label: 'Users' },
  { id: 'volunteers', icon: Users, label: 'Volunteers' },
  { id: 'events', icon: Calendar, label: 'Events' },
  { id: 'polls', icon: BarChart3, label: 'Polls' },
  { id: 'overlays', icon: Layers, label: 'Overlays' },
  { id: 'documents', icon: FileText, label: 'Documents' },
  { id: 'forum', icon: MessageSquare, label: 'Forum' },
  { id: 'mailing', icon: Mail, label: 'Mailing' },
  { id: 'logs', icon: ScrollText, label: 'Logs' },
];

export default function AdminView({ standalone = false }: { standalone?: boolean }) {
  const {
    adminTab, setAdminTab, setAdminViewThread, setAdminViewUser, adminBadges,
    volunteers, allUserDocs, forumPosts, overlayGroups,
    showEventModal, showImportModal, adminProfileUser,
  } = useApp();

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 text-white px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3"><Droplets size={28} className="text-teal-400" /><h1 className="text-xl font-bold">Admin Panel</h1><Shield size={16} className="text-teal-400" /></div>
          <div className="flex items-center gap-3 text-sm">
            <span className="bg-teal-500/20 text-teal-300 px-3 py-1 rounded-full">{volunteers.length} Volunteers</span>
            <span className="bg-orange-500/20 text-orange-300 px-3 py-1 rounded-full">{allUserDocs.filter(d => d.status === 'pending').length} Pending</span>
            <span className="bg-red-500/20 text-red-300 px-3 py-1 rounded-full">{forumPosts.filter(p => p.flagged || p.status === 'pending').length} Flagged</span>
            <span className="bg-cyan-500/20 text-cyan-300 px-3 py-1 rounded-full">{overlayGroups.length} Overlays</span>
            <AccountMenu embedded adminOnly={standalone} />
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex gap-2 mb-6 bg-white rounded-xl p-1.5 shadow-sm overflow-x-auto">
          {adminTabs.map(t => (
            <button key={t.id} onClick={() => { setAdminTab(t.id); setAdminViewThread(null); setAdminViewUser(null); }}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${adminTab === t.id ? 'bg-teal-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              <t.icon size={18} />{t.label}
              <TabBadge count={adminBadges[t.id] || 0} />
            </button>
          ))}
        </div>
        {adminTab === 'dashboard' && <AdminDashboard />}
        {adminTab === 'content' && <AdminContent />}
        {adminTab === 'users' && <AdminUsers />}
        {adminTab === 'volunteers' && <AdminVolunteers />}
        {adminTab === 'events' && <AdminEvents />}
        {adminTab === 'polls' && <AdminPolls />}
        {adminTab === 'overlays' && <AdminOverlays />}
        {adminTab === 'documents' && <AdminDocuments />}
        {adminTab === 'forum' && <AdminForum />}
        {adminTab === 'mailing' && <AdminMailing />}
        {adminTab === 'logs' && <AdminLogs />}
      </div>
      {showEventModal && <EventFormModal />}
      {showImportModal && <ImportOverlayModal />}
      {adminProfileUser && <UserProfileModal />}
    </div>
  );
}
