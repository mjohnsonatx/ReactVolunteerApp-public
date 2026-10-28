// components/user/UserView.jsx
import { lazy, Suspense, useEffect } from 'react';
import { Droplets, Home, Calendar, MessageSquare, FileText, Leaf, BarChart3 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import HomePage from './pages/HomePage';
import EventsPage from './pages/EventsPage';
import EventDetailPage from './pages/EventDetailPage';
import PollsPage from './pages/PollsPage';
import PollDetailPage from './pages/PollDetailPage';
import ForumPage from './pages/ForumPage';
import DocumentsPage from './pages/DocumentsPage';
import PlantsPage from './pages/PlantsPage';
import ProfilePage from './pages/ProfilePage';
import PrivacyPage from './pages/PrivacyPage';
import CookiePage from './pages/CookiePage';
import DocumentViewer from '../DocumentViewer';
import AuthModal from '../modals/AuthModal';
import RsvpModal from '../modals/RsvpModal';
import NewPostModal from '../modals/NewPostModal';
import ReportContentModal from '../modals/ReportContentModal';
import AboutMe from './AboutMe';
import AccountMenu from '../shared/AccountMenu';
import AppLink from '../shared/AppLink';
import VerifyEmailBanner from './VerifyEmailBanner';
import { pathForPage } from '../../router/routes';
import { DEVELOPMENT_PREVIEW, LOCAL_EMAIL_TEST_MODE, PUBLIC_DOCUMENTS_ENABLED } from '../../features';

const EventMapModal = lazy(() => import('../modals/EventMapModal'));

const navItems = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'events', icon: Calendar, label: 'Events' },
  { id: 'polls', icon: BarChart3, label: 'Polls' },
  { id: 'forum', icon: MessageSquare, label: 'Forum' },
  ...(PUBLIC_DOCUMENTS_ENABLED ? [{ id: 'documents', icon: FileText, label: 'Documents' }] : []),
  { id: 'plants', icon: Leaf, label: 'Plant ID' },
];

export default function UserView() {
  const {
    page, route,
    viewingDoc, closeDocument, showAuthModal, showRsvpModal, selectedEventMap, showNewPostModal,
    reportTarget,
  } = useApp();

  useEffect(() => {
    const titles = {
      home: 'WatershedCrew | Tillery Fields',
      events: 'Events | WatershedCrew',
      about: 'About Me | WatershedCrew',
      eventDetail: 'Event | WatershedCrew',
      polls: 'Polls | WatershedCrew',
      pollDetail: 'Poll | WatershedCrew',
      forum: 'Forum | WatershedCrew',
      forumDetail: 'Discussion | WatershedCrew',
      documents: 'Documents | WatershedCrew',
      documentDetail: viewingDoc?.title ? `${viewingDoc.title} | WatershedCrew` : 'Document | WatershedCrew',
      plants: 'Plant ID Guide | WatershedCrew',
      profile: 'Profile | WatershedCrew',
      privacy: 'Privacy Policy | WatershedCrew',
      cookies: 'Cookie Policy | WatershedCrew',
    };
    document.title = titles[page] || 'WatershedCrew | Tillery Fields';
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = `https://tillerystreettrail.web.app${route.path}`;
  }, [page, route.path, viewingDoc?.title]);

  return (
    <div className="public-site-theme min-h-screen bg-gradient-to-br from-gray-100 via-amber-50 to-teal-50 text-gray-800">
      <header className="sticky top-0 z-[1800] bg-white/95 backdrop-blur border-b border-gray-200 shadow-sm">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-6 lg:px-8">
          <div className="col-start-1 row-start-1 flex items-center gap-2">
            <Droplets className="text-teal-600" size={28} />
            <span className="font-bold text-gray-800 whitespace-nowrap">Friends of Tillery Fields</span>
          </div>
          <nav aria-label="Primary navigation" className="col-span-2 row-start-2 flex min-w-0 flex-wrap items-center gap-1 sm:col-span-3 sm:justify-center sm:gap-2 xl:col-span-1 xl:col-start-2 xl:row-start-1">
          {navItems.map(n => {
            const active = page === n.id || page === `${n.id.replace(/s$/, '')}Detail`;
            return (
              <AppLink key={n.id} to={pathForPage(n.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-2 px-2 py-2 sm:px-3 rounded-lg text-sm font-medium whitespace-nowrap ${active ? 'bg-teal-100 text-teal-700' : 'text-gray-600 hover:bg-gray-100'}`}>
                <n.icon size={18} />{n.label}
              </AppLink>
            );
          })}
          </nav>
          <div className="col-start-2 row-start-1 justify-self-end sm:col-start-3">
            <AccountMenu embedded />
          </div>
        </div>
      </header>

      {LOCAL_EMAIL_TEST_MODE && <p role="status" className="bg-amber-100 px-6 py-3 text-sm text-amber-950">Local test mode: disposable data, automatic email verification. Use fake emails and test passwords—not real credentials.</p>}
      {DEVELOPMENT_PREVIEW && <p role="status" className="bg-amber-100 px-6 py-3 text-sm text-amber-950">Development preview: test data only. Use an email address you control to verify your account.</p>}
      <VerifyEmailBanner />

      <main className="p-4 sm:p-8 overflow-auto">
        <div>
          {page === 'home' && <HomePage />}
          {page === 'about' && <AboutMe />}
          {page === 'events' && <EventsPage />}
          {page === 'eventDetail' && <EventDetailPage />}
          {page === 'polls' && <PollsPage />}
          {page === 'pollDetail' && <PollDetailPage />}
          {(page === 'forum' || page === 'forumDetail') && <ForumPage />}
          {PUBLIC_DOCUMENTS_ENABLED && (page === 'documents' || page === 'documentDetail') && <DocumentsPage />}
          {page === 'plants' && <PlantsPage />}
          {page === 'profile' && <ProfilePage />}
          {page === 'privacy' && <PrivacyPage />}
          {page === 'cookies' && <CookiePage />}
          {PUBLIC_DOCUMENTS_ENABLED && viewingDoc && <DocumentViewer doc={viewingDoc} onClose={closeDocument} />}
        </div>
      </main>

      <footer className="mx-4 mb-4 mt-2 border-t border-gray-200 pt-6 text-center text-sm text-gray-400 sm:mx-8 sm:mb-8">
        <div className="flex items-center justify-center gap-4">
          <AppLink to={pathForPage('about')} className="hover:text-teal-600">About Me</AppLink>
          <span aria-hidden="true">|</span>
          <AppLink to={pathForPage('privacy')} className="hover:text-teal-600">Privacy Policy</AppLink>
          <span aria-hidden="true">|</span>
          <AppLink to={pathForPage('cookies')} className="hover:text-teal-600">Cookie Policy</AppLink>
        </div>
        <p className="mt-2">
          Contact: <a className="hover:text-teal-600" href="mailto:tilleryvolunteeradmin@gmail.com">tilleryvolunteeradmin@gmail.com</a>
        </p>
        <p className="mt-2">© {new Date().getFullYear()} Friends of Tillery Fields</p>
      </footer>

      {showAuthModal && <AuthModal />}
      {showRsvpModal && <RsvpModal />}
      {selectedEventMap && (
        <Suspense fallback={<div className="fixed inset-0 z-[3000] grid place-items-center bg-black/40 text-white" role="status">Loading map...</div>}>
          <EventMapModal />
        </Suspense>
      )}
      {showNewPostModal && <NewPostModal />}
      {reportTarget && <ReportContentModal />}
    </div>
  );
}
