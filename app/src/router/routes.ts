// Small history-based router.
//
// The app previously kept the visible page in React state only, which meant
// every screen shared a single URL. Conventional routes are now the source of
// truth so links such as /events/:eventId or /admin/polls can be shared,
// bookmarked, and re-entered with the browser back button.

import { PUBLIC_DOCUMENTS_ENABLED } from '../features';

export type UserPage =
  | 'home'
  | 'about'
  | 'events'
  | 'eventDetail'
  | 'polls'
  | 'pollDetail'
  | 'forum'
  | 'forumDetail'
  | 'documents'
  | 'documentDetail'
  | 'plants'
  | 'profile'
  | 'privacy'
  | 'cookies';

type RouteParams = { eventId?: string; pollId?: string; documentId?: string; postId?: string };

export type AppRoute = {
  view: 'user' | 'admin';
  page: UserPage;
  adminTab: string;
  params: RouteParams;
  path: string;
};

// Admin tab id <-> URL slug. The tab ids are historical; the slugs follow the
// conventional route names requested for the launch.
const ADMIN_TAB_SLUGS: Record<string, string> = {
  dashboard: 'dashboard',
  content: 'content',
  users: 'users',
  volunteers: 'volunteers',
  events: 'events',
  polls: 'polls',
  overlays: 'overlays',
  documents: 'documents',
  forum: 'forum',
  mailing: 'mailing-list',
  logs: 'logs',
};

const ADMIN_SLUG_TABS: Record<string, string> = Object.fromEntries(
  Object.entries(ADMIN_TAB_SLUGS).map(([tab, slug]) => [slug, tab]),
);

// Legacy page ids used across the existing components.
const PAGE_ALIASES: Record<string, UserPage> = {
  calendar: 'events',
  event: 'events',
  poll: 'polls',
};

const USER_PAGE_PATHS: Record<UserPage, string> = {
  home: '/',
  about: '/about',
  events: '/events',
  eventDetail: '/events',
  polls: '/polls',
  pollDetail: '/polls',
  forum: '/forum',
  forumDetail: '/forum',
  documents: '/documents',
  documentDetail: '/documents',
  plants: '/plants',
  profile: '/profile',
  privacy: '/privacy',
  cookies: '/cookies',
};

export function normalizePage(page: string | null | undefined): UserPage {
  if (!page) return 'home';
  if (!PUBLIC_DOCUMENTS_ENABLED && (page === 'documents' || page === 'documentDetail')) return 'home';
  if (PAGE_ALIASES[page]) return PAGE_ALIASES[page];
  return (Object.prototype.hasOwnProperty.call(USER_PAGE_PATHS, page) ? page : 'home') as UserPage;
}

function safeSegment(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const decoded = decodeURIComponent(value);
    return /^[A-Za-z0-9_-]{1,128}$/.test(decoded) ? decoded : undefined;
  } catch {
    return undefined;
  }
}

export function parseRoute(pathname: string): AppRoute {
  const [beforeHash] = (pathname || '/').split('#');
  const [clean, search = ''] = beforeHash.split('?');
  const segments = clean.split('/').filter(Boolean);
  const base: AppRoute = { view: 'user', page: 'home', adminTab: 'dashboard', params: {}, path: '/' };

  if (!segments.length) return base;

  if (segments[0] === 'admin') {
    const slug = segments[1] || 'dashboard';
    const adminTab = ADMIN_SLUG_TABS[slug] || 'dashboard';
    return { ...base, view: 'admin', adminTab, path: `/admin/${ADMIN_TAB_SLUGS[adminTab]}` };
  }

  if (segments[0] === 'events') {
    const eventId = safeSegment(segments[1]);
    return eventId
      ? { ...base, page: 'eventDetail', params: { eventId }, path: `/events/${eventId}` }
      : { ...base, page: 'events', path: '/events' };
  }

  if (segments[0] === 'polls') {
    const pollId = safeSegment(segments[1]);
    return pollId
      ? { ...base, page: 'pollDetail', params: { pollId }, path: `/polls/${pollId}` }
      : { ...base, page: 'polls', path: '/polls' };
  }

  if (segments[0] === 'forum') {
    // Older notification emails link to /forum?post=<id>; treat them as the
    // thread route so useRoute can canonicalize the address bar.
    const postId = safeSegment(segments[1]) || safeSegment(new URLSearchParams(search).get('post') ?? undefined);
    return postId
      ? { ...base, page: 'forumDetail', params: { postId }, path: `/forum/${postId}` }
      : { ...base, page: 'forum', path: '/forum' };
  }

  if (segments[0] === 'documents') {
    if (!PUBLIC_DOCUMENTS_ENABLED) return base;
    const documentId = safeSegment(segments[1]);
    return documentId
      ? { ...base, page: 'documentDetail', params: { documentId }, path: `/documents/${documentId}` }
      : { ...base, page: 'documents', path: '/documents' };
  }

  const page = normalizePage(segments[0]);
  return { ...base, page, path: USER_PAGE_PATHS[page] };
}

export function pathForPage(
  page: string,
  params: RouteParams = {},
): string {
  const normalized = normalizePage(page);
  if (normalized === 'eventDetail' && params.eventId) return `/events/${params.eventId}`;
  if (normalized === 'pollDetail' && params.pollId) return `/polls/${params.pollId}`;
  if (normalized === 'forumDetail' && params.postId) return `/forum/${params.postId}`;
  if (normalized === 'documentDetail' && params.documentId) return `/documents/${params.documentId}`;
  return USER_PAGE_PATHS[normalized];
}

export function pathForAdminTab(tab: string): string {
  return `/admin/${ADMIN_TAB_SLUGS[tab] || 'dashboard'}`;
}

export function adminTabSlug(tab: string): string {
  return ADMIN_TAB_SLUGS[tab] || 'dashboard';
}
