// Desktop-only chrome: a sidebar with grouped navigation and the signed-in
// admin, a page header, and the content area. The shared admin tab components
// from the web app render inside it unchanged.
import { useMemo, useSyncExternalStore, type ComponentType } from 'react';
import {
  BarChart3, Calendar, Droplets, ExternalLink, FileText, Layers, LayoutDashboard, LogOut, Mail, MessageSquare,
  PenLine, ScrollText, UserCog, Users,
} from 'lucide-react';
import { useApp } from '@runtime/app-context';
import AdminUsers from '@app/components/admin/AdminUsers';
import AdminVolunteers from '@app/components/admin/AdminVolunteers';
import AdminEvents from '@app/components/admin/AdminEvents';
import AdminPolls from '@app/components/admin/AdminPolls';
import AdminOverlays from '@app/components/admin/AdminOverlays';
import AdminDocuments from '@app/components/admin/AdminDocuments';
import AdminForum from '@app/components/admin/AdminForum';
import AdminMailing from '@app/components/admin/AdminMailing';
import AdminContent from '@app/components/admin/AdminContent';
import AdminLogs from '@app/components/admin/AdminLogs';
import EventFormModal from '@app/components/modals/EventFormModal';
import ImportOverlayModal from '@app/components/modals/ImportOverlayModal';
import UserProfileModal from '@app/components/modals/UserProfileModal';
import Overview from './Overview';

type NavItem = { id: string; label: string; icon: any; description: string; component: ComponentType };

const NAV: Array<{ heading: string; items: NavItem[] }> = [
  { heading: 'Home', items: [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, description: 'What needs attention and how the community is doing', component: Overview },
    { id: 'logs', label: 'Logs', icon: ScrollText, description: 'Administrator actions and client errors', component: AdminLogs },
  ] },
  { heading: 'Community', items: [
    { id: 'users', label: 'Users', icon: UserCog, description: 'Registered accounts and moderation', component: AdminUsers },
    { id: 'volunteers', label: 'Volunteers', icon: Users, description: 'Everyone who has signed up to help', component: AdminVolunteers },
    { id: 'forum', label: 'Forum', icon: MessageSquare, description: 'Threads, replies, and reports', component: AdminForum },
    { id: 'mailing', label: 'Mailing list', icon: Mail, description: 'Newsletter subscribers, CSV export, and digest email', component: AdminMailing },
  ] },
  { heading: 'Programs', items: [
    { id: 'events', label: 'Events', icon: Calendar, description: 'Workdays, walks, and RSVPs', component: AdminEvents },
    { id: 'polls', label: 'Polls', icon: BarChart3, description: 'Ask the community a question', component: AdminPolls },
  ] },
  { heading: 'Map & files', items: [
    { id: 'overlays', label: 'Map overlays', icon: Layers, description: 'Trail layers and member uploads', component: AdminOverlays },
    { id: 'documents', label: 'Documents', icon: FileText, description: 'Uploads, approvals, and publishing', component: AdminDocuments },
  ] },
  { heading: 'Site', items: [
    { id: 'content', label: 'Site content', icon: PenLine, description: 'Mission, goals, and the about section', component: AdminContent },
  ] },
];

const ALL_ITEMS = NAV.flatMap(group => group.items.map(item => ({ ...item, heading: group.heading })));
const PUBLIC_SITE = (import.meta.env.VITE_PUBLIC_SITE_URL || 'https://tillerystreettrail.web.app').replace(/\/$/, '');

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => { window.removeEventListener('online', callback); window.removeEventListener('offline', callback); };
}

function initials(name: string, email: string) {
  const source = (name || email || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase() : source.slice(0, 2).toUpperCase();
}

export default function DesktopShell() {
  const {
    adminTab, setAdminTab, setAdminViewThread, setAdminViewUser, adminBadges, currentUser, handleSignOut,
    showEventModal, showImportModal, adminProfileUser,
  } = useApp();

  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const active = useMemo(() => ALL_ITEMS.find(item => item.id === adminTab) || ALL_ITEMS[0], [adminTab]);
  const attention = Object.values(adminBadges as Record<string, number>).reduce((total, count) => total + (count || 0), 0);
  const Page = active.component;

  const select = (id: string) => { setAdminTab(id); setAdminViewThread(null); setAdminViewUser(null); };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col bg-slate-900 text-gray-200">
        <div className="flex items-center gap-3 px-5 pb-5 pt-6">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-amber-300">
            <Droplets size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-display text-lg leading-tight text-white">WatershedCrew</p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">Tillery Fields</p>
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Sections">
          {NAV.map(group => (
            <div key={group.heading}>
              <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">{group.heading}</p>
              <ul className="space-y-0.5">
                {group.items.map(item => {
                  const current = item.id === adminTab;
                  const badge = adminBadges[item.id] || 0;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => select(item.id)}
                        aria-current={current ? 'page' : undefined}
                        className={`group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          current ? 'bg-white/10 font-medium text-white' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
                      >
                        {current && <span className="absolute -left-3 top-1.5 h-[calc(100%-12px)] w-1 rounded-r bg-amber-400" aria-hidden="true" />}
                        <item.icon size={17} className={current ? 'text-amber-300' : 'text-gray-400 group-hover:text-gray-200'} aria-hidden="true" />
                        <span className="flex-1 text-left">{item.label}</span>
                        {badge > 0 && (
                          <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {badge > 99 ? '99+' : badge}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 px-3 py-3">
          <a
            href={PUBLIC_SITE}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-white/5 hover:text-white"
          >
            <ExternalLink size={16} className="text-gray-400" aria-hidden="true" />Open public site
          </a>
          <div className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-slate-900">
              {initials(currentUser?.userName, currentUser?.email)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{currentUser?.userName || 'Administrator'}</p>
              <p className="truncate text-xs text-gray-400">{currentUser?.email}</p>
            </div>
            <button type="button" onClick={handleSignOut} aria-label="Sign out" title="Sign out"
              className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white">
              <LogOut size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-gray-200 bg-gray-100/90 px-8 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">{active.heading}</p>
              <h1 className="font-display text-2xl leading-tight text-gray-900">{active.label}</h1>
              <p className="text-sm text-gray-500">{active.description}</p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-600" role="status">
                <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-red-500'}`} aria-hidden="true" />{online ? 'Live' : 'Offline'}
              </span>
              {attention > 0 && adminTab !== 'dashboard' && (
                <button type="button" onClick={() => select('dashboard')}
                  className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-800 hover:bg-orange-200">
                  {attention} item{attention === 1 ? '' : 's'} need attention
                </button>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 px-8 py-6">
          <div className="mx-auto w-full max-w-[1400px]">
            <Page />
          </div>
        </main>
      </div>

      {showEventModal && <EventFormModal />}
      {showImportModal && <ImportOverlayModal />}
      {adminProfileUser && <UserProfileModal />}
    </div>
  );
}
