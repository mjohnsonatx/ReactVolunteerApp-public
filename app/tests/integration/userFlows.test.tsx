import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  addDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
  updateProfile: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  verifyBeforeUpdateEmail: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  updatePassword: vi.fn(),
  deleteUser: vi.fn(),
  getMultiFactorResolver: vi.fn(),
  resolveMfaSignIn: vi.fn(),
  assertionForSignIn: vi.fn(),
  getBlob: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  logError: vi.fn(),
  initializeAccountProfileFn: vi.fn(),
  submitVolunteerSignupFn: vi.fn(),
  subscribeMailingListFn: vi.fn(),
  submitProfileMessageFn: vi.fn(),
  submitRsvpFn: vi.fn(),
  cancelRsvpFn: vi.fn(),
  submitForumPostFn: vi.fn(),
  submitReplyFn: vi.fn(),
  castVoteFn: vi.fn(),
  flagContentFn: vi.fn(),
  createDocumentUploadTicketFn: vi.fn(),
  createDocumentRecordFn: vi.fn(),
  createAdminDocumentRecordFn: vi.fn(),
  setDocumentStatusFn: vi.fn(),
  toggleDocumentPublishedFn: vi.fn(),
  deleteDocumentRecordFn: vi.fn(),
  deleteOwnDocumentFn: vi.fn(),
  deleteVolunteerFn: vi.fn(),
  updateVolunteerFn: vi.fn(),
  removeMailingListEntryFn: vi.fn(),
  saveEventFn: vi.fn(),
  deleteEventFn: vi.fn(),
  approveForumPostFn: vi.fn(),
  deleteForumPostFn: vi.fn(),
  deleteForumReplyFn: vi.fn(),
  unflagForumReplyFn: vi.fn(),
  importOverlayFn: vi.fn(),
  deleteOverlayFn: vi.fn(),
  toggleOverlayPublishedFn: vi.fn(),
  approveOverlayUploadFn: vi.fn(),
  rejectOverlayUploadFn: vi.fn(),
  deleteOverlayUploadFn: vi.fn(),
  toggleUserModerationFn: vi.fn(),
  saveAdminUserProfileFn: vi.fn(),
  adminAnonymizeForumPostsFn: vi.fn(),
  adminDeleteUserDataFn: vi.fn(),
  replyToProfileMessageFn: vi.fn(),
  state: {
    auth: { currentUser: null, isAdmin: false, userVotes: {} },
    publicData: { events: [], forumPosts: [], publicDocs: [], overlayGroups: [] } as Record<string, any>,
    userData: { rsvps: [], myMessages: [] },
    adminData: {
      allUsers: [],
      adminRsvps: [],
      errorLogs: [],
      volunteers: [],
      allUserDocs: [],
      mailingList: [],
      profileMessages: [],
      forumReports: [],
      overlayUploads: [],
    },
    siteContent: {
      mission: '',
      goals: '',
      about: { name: '', bio: '', imageUrl: '', imagePath: '' },
    },
  },
}));

vi.mock('firebase/firestore', () => ({
  addDoc: mocks.addDoc,
  setDoc: mocks.setDoc,
  updateDoc: mocks.updateDoc,
  deleteDoc: mocks.deleteDoc,
  getDocs: mocks.getDocs,
  collection: vi.fn((_, name) => ({ name })),
  doc: vi.fn((_, ...path) => ({ path: path.join('/') })),
  increment: vi.fn(value => ({ increment: value })),
  query: vi.fn((source) => source),
  serverTimestamp: vi.fn(() => 'server-timestamp'),
  where: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: mocks.createUserWithEmailAndPassword,
  sendEmailVerification: mocks.sendEmailVerification,
  updateProfile: mocks.updateProfile,
  signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  signOut: mocks.signOut,
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
  verifyBeforeUpdateEmail: mocks.verifyBeforeUpdateEmail,
  reauthenticateWithCredential: mocks.reauthenticateWithCredential,
  updatePassword: mocks.updatePassword,
  deleteUser: mocks.deleteUser,
  EmailAuthProvider: { credential: vi.fn(() => ({ credential: true })) },
  getMultiFactorResolver: mocks.getMultiFactorResolver,
  TotpMultiFactorGenerator: {
    FACTOR_ID: 'totp',
    assertionForSignIn: mocks.assertionForSignIn,
  },
}));

vi.mock('firebase/storage', () => ({
  deleteObject: vi.fn(() => Promise.resolve()),
  getBlob: mocks.getBlob,
  getDownloadURL: mocks.getDownloadURL,
  ref: vi.fn((_, path) => ({ path })),
  updateMetadata: vi.fn(() => Promise.resolve()),
  uploadBytes: mocks.uploadBytes,
  uploadBytesResumable: vi.fn(() => ({
    on: (_event, _next, _error, complete) => { if (complete) complete(); },
  })),
}));

vi.mock('../../src/firebase', () => ({ auth: {}, db: {}, storage: {} }));
vi.mock('../../src/libs/callables', () => {
  // Unlisted callables resolve to inert stubs so feature work does not require
  // updating this list for every new callable.
  const stubs = new Map();
  const defined = {
  initializeAccountProfileFn: mocks.initializeAccountProfileFn,
  submitVolunteerSignupFn: mocks.submitVolunteerSignupFn,
  subscribeMailingListFn: mocks.subscribeMailingListFn,
  submitProfileMessageFn: mocks.submitProfileMessageFn,
  submitRsvpFn: mocks.submitRsvpFn,
  cancelRsvpFn: mocks.cancelRsvpFn,
  submitForumPostFn: mocks.submitForumPostFn,
  submitReplyFn: mocks.submitReplyFn,
  castVoteFn: mocks.castVoteFn,
  flagContentFn: mocks.flagContentFn,
  createDocumentUploadTicketFn: mocks.createDocumentUploadTicketFn,
  createDocumentRecordFn: mocks.createDocumentRecordFn,
  createAdminDocumentRecordFn: mocks.createAdminDocumentRecordFn,
  setDocumentStatusFn: mocks.setDocumentStatusFn,
  toggleDocumentPublishedFn: mocks.toggleDocumentPublishedFn,
  deleteDocumentRecordFn: mocks.deleteDocumentRecordFn,
  deleteOwnDocumentFn: mocks.deleteOwnDocumentFn,
  deleteVolunteerFn: mocks.deleteVolunteerFn,
  updateVolunteerFn: mocks.updateVolunteerFn,
  removeMailingListEntryFn: mocks.removeMailingListEntryFn,
  saveEventFn: mocks.saveEventFn,
  deleteEventFn: mocks.deleteEventFn,
  approveForumPostFn: mocks.approveForumPostFn,
  deleteForumPostFn: mocks.deleteForumPostFn,
  deleteForumReplyFn: mocks.deleteForumReplyFn,
  unflagForumReplyFn: mocks.unflagForumReplyFn,
  importOverlayFn: mocks.importOverlayFn,
  deleteOverlayFn: mocks.deleteOverlayFn,
  toggleOverlayPublishedFn: mocks.toggleOverlayPublishedFn,
  approveOverlayUploadFn: mocks.approveOverlayUploadFn,
  rejectOverlayUploadFn: mocks.rejectOverlayUploadFn,
  deleteOverlayUploadFn: mocks.deleteOverlayUploadFn,
  toggleUserModerationFn: mocks.toggleUserModerationFn,
  saveAdminUserProfileFn: mocks.saveAdminUserProfileFn,
  adminAnonymizeForumPostsFn: mocks.adminAnonymizeForumPostsFn,
  adminDeleteUserDataFn: mocks.adminDeleteUserDataFn,
  replyToProfileMessageFn: mocks.replyToProfileMessageFn,
    callableErrorMessage: (err, fallback) => (
      typeof err?.code === 'string' && err.code.startsWith('functions/')
        ? err?.message || fallback
        : fallback
    ),
  };
  const reserved = new Set(['then', 'catch', 'finally', 'default', 'constructor']);
  return new Proxy(defined, {
    get(target, prop) {
      if (Reflect.has(target, prop)) return target[prop];
      if (typeof prop !== 'string' || reserved.has(prop)) return undefined;
      if (!stubs.has(prop)) stubs.set(prop, vi.fn(() => Promise.resolve({ data: {} })));
      return stubs.get(prop);
    },
    has: (target, prop) => (typeof prop === 'string' && !reserved.has(prop)) || Reflect.has(target, prop),
  });
});
vi.mock('../../src/utils/logError', () => ({ logError: mocks.logError }));
vi.mock('../../src/utils/thumbnail', () => ({ makeThumbnail: vi.fn(() => Promise.resolve(null)) }));
vi.mock('../../src/components/Map', () => ({ default: () => <div data-testid="map-view" /> }));
vi.mock('../../src/components/PdfPreview', () => ({
  default: ({ title }) => <div role="document" aria-label={`${title} PDF preview`} />,
}));
// Any icon name resolves to a stub so new UI can add icons without touching
// every test mock.
vi.mock('lucide-react', async () => {
  const React = await import('react');
  const Icon = React.forwardRef((props, ref) => React.createElement('svg', { ...props, ref }));
  const reserved = new Set(['then', 'catch', 'finally', 'default', 'constructor']);
  return new Proxy({ __esModule: true }, {
    get: (target, prop) => {
      if (prop === '__esModule') return true;
      if (typeof prop !== 'string' || reserved.has(prop)) return undefined;
      return Icon;
    },
    has: (target, prop) => (typeof prop === 'string' && !reserved.has(prop)) || Reflect.has(target, prop),
  });
});

vi.mock('../../src/hooks/useAuth', async () => {
  const React = await import('react');
  return {
    useAuth: () => {
      const [currentUser, setCurrentUser] = React.useState(mocks.state.auth.currentUser);
      const [userVotes, setUserVotes] = React.useState(mocks.state.auth.userVotes);
      return {
        currentUser,
        setCurrentUser,
        isAdmin: mocks.state.auth.isAdmin,
        authLoading: false,
        userVotes,
        setUserVotes,
      };
    },
  };
});

vi.mock('../../src/hooks/usePublicData', () => ({
  usePublicData: () => mocks.state.publicData,
}));

vi.mock('../../src/hooks/useUserData', () => ({
  useUserData: () => mocks.state.userData,
}));

vi.mock('../../src/hooks/useAdminData', () => ({
  useAdminData: () => mocks.state.adminData,
}));

vi.mock('../../src/hooks/useSiteContent', () => ({
  useSiteContent: () => mocks.state.siteContent,
}));

import { AppProvider, useApp } from '../../src/context/AppContext';
import UserView from '../../src/components/user/UserView';
import HomePage from '../../src/components/user/pages/HomePage';
import AuthModal from '../../src/components/modals/AuthModal';
import ChangePasswordModal from '../../src/components/modals/ChangePasswordModal';
import ChangeEmailModal from '../../src/components/modals/ChangeEmailModal';
import DeleteAccountModal from '../../src/components/modals/DeleteAccountModal';
import RsvpModal from '../../src/components/modals/RsvpModal';
import ForumPage from '../../src/components/user/pages/ForumPage';
import ProfilePage from '../../src/components/user/pages/ProfilePage';
import DocumentViewer from '../../src/components/DocumentViewer';
import PlantsPage from '../../src/components/user/pages/PlantsPage';
import ReportContentModal from '../../src/components/modals/ReportContentModal';
import { getSafeExternalUrl } from '../../src/utils/safeExternalPlantUrls';

function renderWithProvider(ui) {
  return render(<AppProvider>{ui}</AppProvider>);
}

function AuthHarness({ mode = 'signin' }) {
  const ctx = useApp();
  return (
    <>
      <button onClick={() => { ctx.setAuthMode(mode); ctx.setShowAuthModal(true); }}>open auth</button>
      <output aria-label="Assigned username">{ctx.currentUser?.userName || ''}</output>
      {ctx.showAuthModal && <AuthModal />}
    </>
  );
}

function RsvpHarness() {
  const ctx = useApp();
  return (
    <>
      <button
        onClick={() => {
          ctx.setRsvpForm({ eventId: 'event-1', name: 'Jane', email: 'jane@example.com', comments: '' });
          ctx.setShowRsvpModal(true);
        }}
      >
        open rsvp
      </button>
      {ctx.showRsvpModal && <RsvpModal />}
    </>
  );
}

function ForumDetailHarness() {
  const ctx = useApp();
  return (
    <>
      <button onClick={() => ctx.setSelectedPost(mocks.state.publicData.forumPosts[0])}>open thread</button>
      <ForumPage />
      {ctx.reportTarget && <ReportContentModal />}
    </>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.addDoc.mockResolvedValue({ id: 'new-doc' });
  mocks.setDoc.mockResolvedValue(undefined);
  mocks.updateDoc.mockResolvedValue(undefined);
  mocks.deleteDoc.mockResolvedValue(undefined);
  mocks.getDocs.mockResolvedValue({ docs: [] });
  mocks.createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'new-user', emailVerified: false } });
  mocks.sendEmailVerification.mockResolvedValue(undefined);
  mocks.updateProfile.mockResolvedValue(undefined);
  mocks.signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'signed-in-user' } });
  mocks.signOut.mockResolvedValue(undefined);
  mocks.sendPasswordResetEmail.mockResolvedValue(undefined);
  mocks.verifyBeforeUpdateEmail.mockResolvedValue(undefined);
  mocks.reauthenticateWithCredential.mockResolvedValue(undefined);
  mocks.updatePassword.mockResolvedValue(undefined);
  mocks.deleteUser.mockResolvedValue(undefined);
  mocks.resolveMfaSignIn.mockResolvedValue({ user: { uid: 'mfa-user' } });
  mocks.assertionForSignIn.mockImplementation((enrollmentId, code) => ({ enrollmentId, code }));
  mocks.getMultiFactorResolver.mockReturnValue({
    hints: [{ factorId: 'totp', uid: 'totp-enrollment' }],
    resolveSignIn: mocks.resolveMfaSignIn,
  });
  mocks.getBlob.mockResolvedValue(new Blob(['ok'], { type: 'application/pdf' }));
  mocks.uploadBytes.mockResolvedValue({});
  mocks.getDownloadURL.mockResolvedValue('https://example.test/document.pdf');
  mocks.initializeAccountProfileFn.mockResolvedValue({ data: { uid: 'new-user', userName: 'jane-2' } });
  mocks.submitVolunteerSignupFn.mockResolvedValue({ data: { ok: true } });
  mocks.subscribeMailingListFn.mockResolvedValue({ data: { ok: true } });
  mocks.submitProfileMessageFn.mockResolvedValue({ data: { ok: true } });
  mocks.submitRsvpFn.mockResolvedValue({ data: { id: 'rsvp-1' } });
  mocks.cancelRsvpFn.mockResolvedValue({ data: { ok: true } });
  mocks.submitForumPostFn.mockResolvedValue({ data: { id: 'post-1', status: 'approved' } });
  mocks.submitReplyFn.mockResolvedValue({ data: { reply: { id: 'reply-1' } } });
  mocks.castVoteFn.mockResolvedValue({ data: { votes: {} } });
  mocks.flagContentFn.mockResolvedValue({ data: { ok: true } });
  mocks.createDocumentUploadTicketFn.mockResolvedValue({ data: {
    ticketId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    storagePath: 'documents/user-1/aaaaaaaaaaaaaaaaaaaaaaaa.pdf',
    thumbnailPath: '',
  } });
  mocks.createDocumentRecordFn.mockResolvedValue({ data: { id: 'doc-1' } });
  mocks.createAdminDocumentRecordFn.mockResolvedValue({ data: { id: 'doc-1' } });
  mocks.setDocumentStatusFn.mockResolvedValue({ data: { ok: true } });
  mocks.toggleDocumentPublishedFn.mockResolvedValue({ data: { published: true } });
  mocks.deleteDocumentRecordFn.mockResolvedValue({ data: { ok: true } });
  mocks.deleteOwnDocumentFn.mockResolvedValue({ data: { ok: true, id: 'doc-1' } });
  mocks.deleteVolunteerFn.mockResolvedValue({ data: { ok: true } });
  mocks.updateVolunteerFn.mockResolvedValue({ data: { ok: true } });
  mocks.removeMailingListEntryFn.mockResolvedValue({ data: { ok: true } });
  mocks.saveEventFn.mockResolvedValue({ data: { id: 'event-1' } });
  mocks.deleteEventFn.mockResolvedValue({ data: { ok: true } });
  mocks.approveForumPostFn.mockResolvedValue({ data: { ok: true } });
  mocks.deleteForumPostFn.mockResolvedValue({ data: { ok: true } });
  mocks.deleteForumReplyFn.mockResolvedValue({ data: { ok: true } });
  mocks.unflagForumReplyFn.mockResolvedValue({ data: { ok: true } });
  mocks.importOverlayFn.mockResolvedValue({ data: { id: 'overlay-1' } });
  mocks.deleteOverlayFn.mockResolvedValue({ data: { ok: true } });
  mocks.toggleOverlayPublishedFn.mockResolvedValue({ data: { published: false } });
  mocks.approveOverlayUploadFn.mockResolvedValue({ data: { id: 'overlay-1' } });
  mocks.rejectOverlayUploadFn.mockResolvedValue({ data: { ok: true } });
  mocks.deleteOverlayUploadFn.mockResolvedValue({ data: { ok: true } });
  mocks.toggleUserModerationFn.mockResolvedValue({ data: { moderated: true } });
  mocks.saveAdminUserProfileFn.mockResolvedValue({ data: {} });
  mocks.adminAnonymizeForumPostsFn.mockResolvedValue({ data: { changed: 0 } });
  mocks.adminDeleteUserDataFn.mockResolvedValue({ data: { ok: true } });
  mocks.replyToProfileMessageFn.mockResolvedValue({ data: { ok: true } });
  mocks.state.auth = { currentUser: null, isAdmin: false, userVotes: {} };
  mocks.state.publicData = { events: [], forumPosts: [], publicDocs: [], overlayGroups: [] };
  mocks.state.userData = { rsvps: [], myMessages: [] };
  mocks.state.adminData = {
    allUsers: [],
    adminRsvps: [],
    errorLogs: [],
    volunteers: [],
    allUserDocs: [],
    mailingList: [],
    profileMessages: [],
    forumReports: [],
    overlayUploads: [],
  };
  mocks.state.siteContent = {
    mission: 'Keep the creek clean.',
    goals: 'Build a safer trail.',
    about: { name: 'River Lead', bio: 'Local cleanup organizer.', imageUrl: '', imagePath: '' },
  };
});

describe('visitor navigation and public content', () => {
  it('keeps About Me hidden until its footer link is opened', async () => {
    renderWithProvider(<UserView />);
    const user = userEvent.setup();

    const nav = screen.getByRole('navigation', { name: /primary navigation/i });
    expect(nav).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /about me/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /about me/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /volunteer coordinator/i })).not.toBeInTheDocument();

    const footer = screen.getByRole('contentinfo');
    await user.click(within(footer).getByRole('link', { name: /about me/i }));

    expect(screen.getByRole('region', { name: /about me/i })).toHaveTextContent('River Lead');
    expect(screen.getByRole('region', { name: /about me/i }).querySelector('img')).toBeNull();

    await user.click(screen.getByRole('link', { name: 'Home' }));
    expect(screen.getByRole('heading', { name: /creek & watershed clean-up/i })).toBeInTheDocument();
  });

  it('lets visitors move through the primary pages without data loaded', async () => {
    renderWithProvider(<UserView />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('link', { name: 'Events' }));
    expect(screen.getByText(/no upcoming events/i)).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /documents/i }));
    expect(screen.getByText(/no documents posted yet/i)).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /plant id/i }));
    expect(screen.getByRole('heading', { name: /plant id guide/i })).toBeInTheDocument();
    expect(screen.getAllByText(/sorghum halepense/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/warm-season growth/i)).toBeInTheDocument();
    expect(screen.getAllByText(/fall color/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/summer seed pods/i)).toBeInTheDocument();
    expect(screen.getByAltText(/johnsongrass foliage/i)).toBeInTheDocument();
    expect(screen.getByText(/triadica sebifera/i)).toBeInTheDocument();
    expect(screen.getByText(/rapistrum rugosum/i)).toBeInTheDocument();
  });

  it('links the invasive flora goal to the Plant ID guide', async () => {
    mocks.state.siteContent = {
      mission: '',
      goals: '',
      about: { name: '', bio: '', imageUrl: '', imagePath: '' },
    };
    renderWithProvider(<UserView />);
    const user = userEvent.setup();

    expect(screen.getByRole('heading', { name: /our mission/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /our goals/i })).toBeInTheDocument();
    expect(screen.getByText(/restoration plan priorities/i)).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: /remove invasive flora/i }));

    expect(screen.getByRole('heading', { name: /plant id guide/i })).toBeInTheDocument();
    expect(screen.getByText(/johnsongrass \/ johnson grass/i)).toBeInTheDocument();
  });

  it('shows a signed-in greeting in the account menu trigger', () => {
    mocks.state.auth.currentUser = { id: 'user-1', name: 'Jane Walker', userName: 'jane-walker', email: 'jane@example.com', moderated: false };

    renderWithProvider(<UserView />);

    expect(screen.getByRole('button', { name: /account menu/i })).toHaveTextContent('Hi, jane-walker');
  });
});

describe('plant guide external URL guards', () => {
  it('allows only the approved HTTPS plant source URLs', () => {
    expect(getSafeExternalUrl(' https://commons.wikimedia.org/wiki/File:A_forage_plant.jpg ')).toBe('https://commons.wikimedia.org/wiki/File:A_forage_plant.jpg');
    expect(getSafeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(getSafeExternalUrl('http://commons.wikimedia.org/wiki/File:A_forage_plant.jpg')).toBeNull();
    expect(getSafeExternalUrl('https://commons.wikimedia.org.evil.test/wiki/File:A_forage_plant.jpg')).toBeNull();
    expect(getSafeExternalUrl('https://commons.wikimedia.org/wiki/File:Not_approved.jpg')).toBeNull();
    expect(getSafeExternalUrl('/wiki/File:A_forage_plant.jpg')).toBeNull();
  });

  it('renders plant image and source links with guarded external-link attributes', () => {
    const { container } = render(<PlantsPage />);
    const links = Array.from(container.querySelectorAll('a[target="_blank"]'));
    const images = Array.from(container.querySelectorAll('img'));

    expect(links.length).toBeGreaterThan(0);
    expect(images).toHaveLength(9);

    links.forEach(link => {
      expect(getSafeExternalUrl(link.getAttribute('href'))).not.toBeNull();
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveAttribute('referrerpolicy', 'no-referrer');
    });

    images.forEach(image => {
      expect(getSafeExternalUrl(image.getAttribute('src'))).not.toBeNull();
      expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
    });
  });
});

describe('home page signup flows', () => {
  it('submits a volunteer signup and shows the success state', async () => {
    mocks.state.siteContent = {
      mission: '',
      goals: '',
      about: { name: '', bio: '', imageUrl: '', imagePath: '' },
    };
    renderWithProvider(<HomePage />);
    const user = userEvent.setup();

    expect(screen.getByText(/restoration plan priorities/i)).toBeInTheDocument();
    expect(screen.getByText(/remove invasive flora/i)).toBeInTheDocument();
    expect(screen.getByText(/ada-accessible infrastructure/i)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Name'), 'Jane Walker');
    await user.type(screen.getAllByPlaceholderText('Email')[0], 'jane@example.com');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    await waitFor(() => expect(mocks.submitVolunteerSignupFn).toHaveBeenCalledWith({
      name: 'Jane Walker',
      email: 'jane@example.com',
      phone: '',
    }));
    expect(await screen.findByText(/thanks for signing up/i)).toBeInTheDocument();
  });

  it('shows a graceful volunteer signup failure', async () => {
    mocks.submitVolunteerSignupFn.mockRejectedValueOnce(new Error('network down'));
    renderWithProvider(<HomePage />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText('Name'), 'Jane Walker');
    await user.type(screen.getAllByPlaceholderText('Email')[0], 'jane@example.com');
    await user.click(screen.getByRole('button', { name: /sign up/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'handleSignup');
  });

  it('shows a graceful newsletter failure instead of silently logging only', async () => {
    mocks.subscribeMailingListFn.mockRejectedValueOnce(new Error('network down'));
    renderWithProvider(<HomePage />);
    const user = userEvent.setup();

    await user.type(screen.getAllByPlaceholderText('Email')[1], 'jane@example.com');
    await user.click(screen.getByRole('button', { name: /subscribe/i }));

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'handleMailingList');
  });
});

describe('authentication flows', () => {
  it('updates password-manager hints when switching between sign-in and signup', async () => {
    renderWithProvider(<AuthHarness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /open auth/i }));

    expect(screen.getByPlaceholderText('Email')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByPlaceholderText('Password')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.queryByPlaceholderText('Confirm Password')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /don't have an account/i }));
    expect(screen.queryByPlaceholderText('Full Name')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Username')).not.toBeInTheDocument();
    expect(screen.getByText(/public username is created from/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Email')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByPlaceholderText('Password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByPlaceholderText('Password')).toHaveAttribute('minlength', '15');
    expect(screen.getByPlaceholderText('Password')).toHaveAttribute('maxlength', '25');
    expect(screen.getByPlaceholderText('Confirm Password')).toHaveAttribute('autocomplete', 'new-password');
    expect(screen.getByPlaceholderText('Confirm Password')).toHaveAttribute('minlength', '15');
    expect(screen.getByPlaceholderText('Confirm Password')).toHaveAttribute('maxlength', '25');

    await user.click(screen.getByRole('button', { name: /already have an account/i }));
    expect(screen.getByPlaceholderText('Password')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.queryByPlaceholderText('Confirm Password')).not.toBeInTheDocument();
  });

  it('creates an account in Firebase Auth, initializes its profile, and sends verification', async () => {
    renderWithProvider(<AuthHarness mode="signup" />);
    const user = userEvent.setup();

    await user.click(screen.getByText('open auth'));
    await user.type(screen.getByPlaceholderText('Email'), 'jane@example.com');
    expect(screen.getByText(/public username is created from/i)).toHaveTextContent('@jane');
    await user.type(screen.getByPlaceholderText('Password'), 'secret123456789');
    await user.type(screen.getByPlaceholderText('Confirm Password'), 'secret123456789');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(mocks.initializeAccountProfileFn).toHaveBeenCalledWith({}));
    expect(mocks.createUserWithEmailAndPassword).toHaveBeenCalledWith({}, 'jane@example.com', 'secret123456789');
    expect(mocks.sendEmailVerification).toHaveBeenCalledWith(expect.objectContaining({ uid: 'new-user' }));
    expect(screen.getByLabelText('Assigned username')).toHaveTextContent('jane-2');
  });

  it('keeps the sign-in modal open with a friendly error on auth failure', async () => {
    mocks.signInWithEmailAndPassword.mockRejectedValueOnce(new Error('Firebase: bad password (auth/wrong-password).'));
    renderWithProvider(<AuthHarness />);
    const user = userEvent.setup();

    await user.click(screen.getByText('open auth'));
    await user.type(screen.getByPlaceholderText('Email'), 'jane@example.com');
    await user.type(screen.getByPlaceholderText('Password'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
  });

  it('completes a TOTP challenge when Firebase requires a second factor', async () => {
    mocks.signInWithEmailAndPassword.mockRejectedValueOnce({ code: 'auth/multi-factor-auth-required' });
    renderWithProvider(<AuthHarness />);
    const user = userEvent.setup();

    await user.click(screen.getByText('open auth'));
    await user.type(screen.getByPlaceholderText('Email'), 'admin@example.com');
    await user.type(screen.getByPlaceholderText('Password'), 'current-password');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByRole('heading', { name: /two-step verification/i })).toBeInTheDocument();
    const code = screen.getByRole('textbox', { name: /authenticator code/i });
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(code).toHaveAttribute('pattern', '[0-9]{6}');
    await user.type(code, '12a34567');
    expect(code).toHaveValue('123456');
    await user.click(screen.getByRole('button', { name: /verify and sign in/i }));

    await waitFor(() => expect(mocks.resolveMfaSignIn).toHaveBeenCalledWith({
      enrollmentId: 'totp-enrollment',
      code: '123456',
    }));
    expect(mocks.assertionForSignIn).toHaveBeenCalledWith('totp-enrollment', '123456');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps a failed TOTP challenge recoverable and lets the user change accounts', async () => {
    mocks.signInWithEmailAndPassword.mockRejectedValueOnce({ code: 'auth/multi-factor-auth-required' });
    mocks.resolveMfaSignIn.mockRejectedValueOnce({ code: 'auth/invalid-verification-code' });
    renderWithProvider(<AuthHarness />);
    const user = userEvent.setup();

    await user.click(screen.getByText('open auth'));
    await user.type(screen.getByPlaceholderText('Email'), 'admin@example.com');
    await user.type(screen.getByPlaceholderText('Password'), 'current-password');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    const code = await screen.findByRole('textbox', { name: /authenticator code/i });
    await user.type(code, '654321');
    await user.click(screen.getByRole('button', { name: /verify and sign in/i }));

    expect(await screen.findByText(/authenticator code was not accepted/i)).toBeInTheDocument();
    expect(code).toHaveValue('');
    await user.click(screen.getByRole('button', { name: /use a different account/i }));
    expect(screen.getByRole('heading', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Password')).toHaveAttribute('autocomplete', 'current-password');
  });
});

describe('account form autocomplete', () => {
  it('distinguishes the existing password from both new-password fields', () => {
    const { container } = renderWithProvider(<ChangePasswordModal open onClose={vi.fn()} />);
    expect(container.querySelector('input[name="currentPassword"]')).toHaveAttribute('autocomplete', 'current-password');
    expect(container.querySelector('input[name="newPassword"]')).toHaveAttribute('autocomplete', 'new-password');
    expect(container.querySelector('input[name="newPassword"]')).toHaveAttribute('minlength', '15');
    expect(container.querySelector('input[name="newPassword"]')).toHaveAttribute('maxlength', '25');
    expect(container.querySelector('input[name="confirmPassword"]')).toHaveAttribute('autocomplete', 'new-password');
    expect(container.querySelector('input[name="confirmPassword"]')).toHaveAttribute('minlength', '15');
    expect(container.querySelector('input[name="confirmPassword"]')).toHaveAttribute('maxlength', '25');
  });

  it('identifies the new email and existing password when changing email', () => {
    const { container } = renderWithProvider(<ChangeEmailModal open currentEmail="jane@example.com" onClose={vi.fn()} />);
    expect(container.querySelector('input[name="newEmail"]')).toHaveAttribute('autocomplete', 'email');
    expect(container.querySelector('input[name="currentPassword"]')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('allows password-manager reauthentication while keeping deletion confirmation manual', async () => {
    const { container } = renderWithProvider(<DeleteAccountModal open onClose={vi.fn()} />);
    const password = container.querySelector<HTMLInputElement>('input[name="currentPassword"]')!;
    const confirmation = screen.getByPlaceholderText('DELETE');
    const submit = screen.getByRole('button', { name: /permanently delete/i });
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(confirmation).toHaveAttribute('autocomplete', 'off');
    expect(submit).toBeDisabled();

    const user = userEvent.setup();
    await user.type(password, 'test-password');
    expect(submit).toBeDisabled();
    await user.type(confirmation, 'DELETE');
    expect(submit).toBeEnabled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
});

describe('event and forum flows', () => {
  it('submits an RSVP for a signed-in user', async () => {
    mocks.state.auth.currentUser = { id: 'user-1', name: 'Jane', email: 'jane@example.com', moderated: false };
    renderWithProvider(<RsvpHarness />);
    const user = userEvent.setup();

    await user.click(screen.getByText('open rsvp'));
    await user.type(screen.getByPlaceholderText(/comments/i), 'See you there.');
    await user.click(screen.getByRole('button', { name: /confirm rsvp/i }));

    await waitFor(() => expect(mocks.submitRsvpFn).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: 'event-1', name: 'Jane', email: 'jane@example.com' })
    ));
  });

  it('shows a graceful RSVP failure', async () => {
    mocks.state.auth.currentUser = { id: 'user-1', name: 'Jane', email: 'jane@example.com', moderated: false };
    mocks.submitRsvpFn.mockRejectedValueOnce(new Error('network down'));
    renderWithProvider(<RsvpHarness />);
    const user = userEvent.setup();

    await user.click(screen.getByText('open rsvp'));
    await user.click(screen.getByRole('button', { name: /confirm rsvp/i }));

    expect(await screen.findByText(/could not submit rsvp/i)).toBeInTheDocument();
  });

  it('refreshes an open thread from live snapshots and closes it when withdrawn', async () => {
    mocks.state.auth.currentUser = { id: 'user-1', name: 'Jane', email: 'jane@example.com', moderated: false };
    const post = {
      id: 'post-1', title: 'Live cleanup thread', author: 'Sam', authorId: 'user-2',
      content: 'Meet at 9.', date: 'today', status: 'approved', replies: [], upvotes: 0, downvotes: 0,
    };
    mocks.state.publicData.forumPosts = [post];
    const { rerender } = renderWithProvider(<ForumDetailHarness />);
    await userEvent.setup().click(screen.getByText('open thread'));
    expect(screen.getByRole('heading', { name: '0 Replies' })).toBeInTheDocument();

    mocks.state.publicData.forumPosts = [{ ...post, replies: [{
      id: 'reply-1', author: 'Jane', authorId: 'user-1', text: 'I can bring bags.', date: 'today', upvotes: 0, downvotes: 0,
    }] }];
    rerender(<AppProvider><ForumDetailHarness /></AppProvider>);
    expect(screen.getByText('I can bring bags.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '1 Replies' })).toBeInTheDocument();

    mocks.state.publicData.forumPosts = [{ ...post, status: 'pending' }];
    rerender(<AppProvider><ForumDetailHarness /></AppProvider>);
    expect(screen.queryByText('I can bring bags.')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'This discussion has been removed' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/forum/post-1');
    mocks.state.publicData.forumPosts = [];
    rerender(<AppProvider><ForumDetailHarness /></AppProvider>);
    expect(screen.queryByRole('heading', { name: 'Live cleanup thread' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('link', { name: /back to forum/i }));
    expect(window.location.pathname).toBe('/forum');
    expect(screen.getByRole('heading', { name: 'Forum' })).toBeInTheDocument();
  });

  it('explains a thread removed mid-reply and leads back to the forum', async () => {
    mocks.state.auth.currentUser = { id: 'user-1', name: 'Jane', email: 'jane@example.com', moderated: false };
    const post = {
      id: 'post-1', title: 'Doomed thread', author: 'Sam', authorId: 'user-2',
      content: 'Meet at 9.', date: 'today', status: 'approved', replies: [], upvotes: 0, downvotes: 0,
    };
    mocks.state.publicData.forumPosts = [post];
    const { rerender } = renderWithProvider(<ForumDetailHarness />);
    const user = userEvent.setup();
    await user.click(screen.getByText('open thread'));
    await user.type(screen.getByPlaceholderText(/write a reply/i), 'Half a reply');

    // A moderator deletes the thread while the member is typing.
    mocks.state.publicData.forumPosts = [];
    rerender(<AppProvider><ForumDetailHarness /></AppProvider>);
    const heading = screen.getByRole('heading', { name: 'This discussion has been removed' });
    expect(heading).toHaveFocus();
    expect(screen.getByText(/a moderator removed it/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/write a reply/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to forum/i })).toHaveAttribute('href', '/forum');

    await user.click(screen.getByRole('link', { name: /back to forum/i }));
    expect(window.location.pathname).toBe('/forum');
    expect(screen.getByRole('heading', { name: 'Forum' })).toBeInTheDocument();
  });

  it('treats a link to a thread that is already gone as unavailable, not removed', async () => {
    window.history.replaceState(null, '', '/forum/never-existed');
    mocks.state.publicData = { ...mocks.state.publicData, forumPosts: [], forumSynced: true };
    renderWithProvider(<ForumPage />);
    const heading = screen.getByRole('heading', { name: /this discussion isn.t available/i });
    expect(heading).not.toHaveFocus();
    expect(screen.getByText(/the link may be incorrect/i)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('link', { name: /back to forum/i }));
    expect(window.location.pathname).toBe('/forum');
  });

  it('keeps the URL, history, and open thread in sync', async () => {
    const posts = ['a', 'b'].map(id => ({
      id: `post-${id}`, title: `Thread ${id}`, author: 'Sam', authorId: 'user-2',
      content: 'Meet at 9.', date: 'today', status: 'approved', replies: [], upvotes: 0, downvotes: 0,
    }));
    mocks.state.publicData.forumPosts = posts;
    window.history.replaceState(null, '', '/forum?post=post-b');
    renderWithProvider(<ForumPage />);
    const user = userEvent.setup();

    // Legacy notification links land on the canonical thread URL.
    expect(await screen.findByRole('heading', { name: 'Thread b' })).toBeInTheDocument();
    expect(`${window.location.pathname}${window.location.search}`).toBe('/forum/post-b');

    await user.click(screen.getByRole('button', { name: /back/i }));
    await user.click(screen.getByRole('link', { name: 'Thread a' }));
    expect(window.location.pathname).toBe('/forum/post-a');
    expect(screen.getByRole('heading', { name: 'Thread a' })).toBeInTheDocument();

    // Browser back returns to the list instead of leaving a ghost thread open.
    act(() => {
      window.history.replaceState(null, '', '/forum');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('heading', { name: 'Forum' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '0 Replies' })).not.toBeInTheDocument();
  });

  it('does not call a linked thread missing until the server has answered', async () => {
    const post = {
      id: 'post-1', title: 'Cached thread', author: 'Sam', authorId: 'user-2',
      content: 'Meet at 9.', date: 'today', status: 'approved', replies: [], upvotes: 0, downvotes: 0,
    };
    window.history.replaceState(null, '', '/forum/post-1');
    // Empty cache answer (offline or stalled connection): still loading.
    mocks.state.publicData = { ...mocks.state.publicData, forumPosts: [], forumSynced: false };
    const { rerender } = renderWithProvider(<ForumPage />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading discussions/i);
    expect(screen.queryByText(/removed|isn.t available/i)).not.toBeInTheDocument();

    // The thread is in the cache: show it before the server confirms.
    mocks.state.publicData = { ...mocks.state.publicData, forumPosts: [post], forumSynced: false };
    rerender(<AppProvider><ForumPage /></AppProvider>);
    expect(screen.getByRole('heading', { name: 'Cached thread' })).toBeInTheDocument();

    // The list does not call an unconfirmed empty cache "no posts".
    window.history.replaceState(null, '', '/forum');
    mocks.state.publicData = { ...mocks.state.publicData, forumPosts: [], forumSynced: false };
    rerender(<AppProvider><ForumPage /></AppProvider>);
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(screen.queryByText(/no posts yet/i)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/loading discussions/i);
    window.history.replaceState(null, '', '/forum/post-1');
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });

    // Only a server answer without the thread makes it missing (it was shown
    // from the cache, so it reads as removed).
    mocks.state.publicData = { ...mocks.state.publicData, forumPosts: [], forumSynced: true };
    rerender(<AppProvider><ForumPage /></AppProvider>);
    expect(screen.getByRole('heading', { name: 'This discussion has been removed' })).toBeInTheDocument();

    const retryForum = vi.fn();
    mocks.state.publicData = { ...mocks.state.publicData, forumSynced: false, forumError: true, retryForum };
    rerender(<AppProvider><ForumPage /></AppProvider>);
    expect(screen.getByRole('alert')).toHaveTextContent(/could not load the forum/i);
    expect(screen.queryByText(/removed|isn.t available/i)).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: /try again/i }));
    expect(retryForum).toHaveBeenCalled();
  });

  it('sends a reply once however Enter is pressed', async () => {
    mocks.state.auth.currentUser = { id: 'user-1', name: 'Jane', email: 'jane@example.com', moderated: false };
    mocks.state.publicData.forumPosts = [{
      id: 'post-1', title: 'Cleanup thread', author: 'Sam', authorId: 'user-2',
      content: 'Meet at 9.', date: 'today', status: 'approved', replies: [], upvotes: 0, downvotes: 0,
    }];
    let finish: (value: unknown) => void = () => {};
    mocks.submitReplyFn.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    renderWithProvider(<ForumDetailHarness />);
    const user = userEvent.setup();
    await user.click(screen.getByText('open thread'));
    const input = screen.getByPlaceholderText(/write a reply/i);
    await user.type(input, 'こんにちは');

    // Enter that confirms an IME composition must not send.
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: true });
    expect(mocks.submitReplyFn).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mocks.submitReplyFn).toHaveBeenCalledTimes(1);
    await act(async () => { finish({ data: { status: 'approved' } }); });
    expect(screen.getByRole('heading', { name: /cleanup thread/i })).toBeInTheDocument();
  });

  it('keeps a draft typed in another thread when an earlier reply finishes sending', async () => {
    mocks.state.auth.currentUser = { id: 'user-1', name: 'Jane', email: 'jane@example.com', moderated: false };
    const thread = (id: string, title: string) => ({
      id, title, author: 'Sam', authorId: 'user-2', content: 'x', date: 'today', status: 'approved', replies: [], upvotes: 0, downvotes: 0,
    });
    mocks.state.publicData.forumPosts = [thread('post-a', 'Thread A'), thread('post-b', 'Thread B')];
    let finish: (value: unknown) => void = () => {};
    mocks.submitReplyFn.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    renderWithProvider(<ForumDetailHarness />);
    const user = userEvent.setup();
    await user.click(screen.getByText('open thread'));
    await user.type(screen.getByPlaceholderText(/write a reply/i), 'Reply to A{Enter}');
    expect(mocks.submitReplyFn).toHaveBeenCalledWith(expect.objectContaining({ postId: 'post-a', text: 'Reply to A' }));

    // While A's reply is still sending, the member goes back to thread B
    // (browser Back, swipe, or any browser without `inert`) and starts typing.
    act(() => {
      window.history.pushState(null, '', '/forum/post-b');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    // The page is aria-hidden behind the "Posting reply..." overlay meanwhile.
    expect(screen.getByRole('heading', { name: 'Thread B', hidden: true })).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/write a reply/i), { target: { value: 'Draft for B' } });

    await act(async () => { finish({ data: { status: 'pending' } }); });
    expect(screen.getByPlaceholderText(/write a reply/i)).toHaveValue('Draft for B');
    // A's "awaiting approval" notice belongs to A, not to the thread on screen.
    expect(screen.queryByText(/awaiting administrator approval/i)).not.toBeInTheDocument();
  });

  it('keeps text typed after the sent reply when the send finishes', async () => {
    mocks.state.auth.currentUser = { id: 'user-1', name: 'Jane', email: 'jane@example.com', moderated: false };
    mocks.state.publicData.forumPosts = [{
      id: 'post-a', title: 'Thread A', author: 'Sam', authorId: 'user-2', content: 'x', date: 'today', status: 'approved', replies: [], upvotes: 0, downvotes: 0,
    }];
    let finish: (value: unknown) => void = () => {};
    mocks.submitReplyFn.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    renderWithProvider(<ForumDetailHarness />);
    const user = userEvent.setup();
    await user.click(screen.getByText('open thread'));
    await user.type(screen.getByPlaceholderText(/write a reply/i), 'First thought{Enter}');
    fireEvent.change(screen.getByPlaceholderText(/write a reply/i), { target: { value: 'First thought and a second one' } });
    await act(async () => { finish({ data: { status: 'approved' } }); });
    expect(screen.getByPlaceholderText(/write a reply/i)).toHaveValue('and a second one');
  });

  it('shows a graceful reply failure without losing the thread', async () => {
    mocks.state.auth.currentUser = { id: 'user-1', name: 'Jane', email: 'jane@example.com', moderated: false };
    mocks.state.publicData.forumPosts = [{
      id: 'post-1',
      title: 'Cleanup thread',
      author: 'Sam',
      authorId: 'user-2',
      content: 'Meet at 9.',
      date: 'today',
      status: 'approved',
      replies: [],
      upvotes: 0,
      downvotes: 0,
    }];
    mocks.submitReplyFn.mockRejectedValueOnce(new Error('network down'));
    renderWithProvider(<ForumDetailHarness />);
    const user = userEvent.setup();

    await user.click(screen.getByText('open thread'));
    await user.type(screen.getByPlaceholderText(/write a reply/i), 'I can bring bags.');
    await user.click(screen.getByLabelText('Reply anonymously'));
    await user.click(screen.getByPlaceholderText(/write a reply/i));
    await user.keyboard('{Enter}');

    expect(await screen.findByText(/could not post reply/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /cleanup thread/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Reply anonymously')).toBeChecked();
    expect(mocks.submitReplyFn).toHaveBeenCalledWith({ postId: 'post-1', text: 'I can bring bags.', anonymous: true });
    await user.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(screen.getByPlaceholderText(/write a reply/i)).toHaveValue(''));
    expect(screen.getByLabelText('Reply anonymously')).toBeChecked();
  });

  it('collects a report reason and marks the post reported for the signed-in user', async () => {
    mocks.state.auth.currentUser = { id: 'user-1', name: 'Jane', email: 'jane@example.com', moderated: false, reportedContent: {} };
    mocks.state.publicData.forumPosts = [{
      id: 'post-1',
      title: 'Cleanup thread',
      author: 'Sam',
      authorId: 'user-2',
      content: 'Meet at 9.',
      date: 'today',
      status: 'approved',
      replies: [],
      upvotes: 0,
      downvotes: 0,
    }];
    mocks.flagContentFn.mockResolvedValueOnce({ data: { ok: true, reportedContent: { 'post-1_post': true } } });
    renderWithProvider(<ForumDetailHarness />);
    const user = userEvent.setup();

    await user.click(screen.getByText('open thread'));
    await user.click(screen.getByRole('button', { name: /^report$/i }));
    await user.selectOptions(screen.getByLabelText(/reason/i), 'privacy');
    await user.type(screen.getByLabelText(/what should we know/i), 'This includes a private phone number.');
    await user.click(screen.getByRole('button', { name: /submit report/i }));

    await waitFor(() => expect(mocks.flagContentFn).toHaveBeenCalledWith({
      postId: 'post-1',
      replyId: null,
      reason: 'privacy',
      details: 'This includes a private phone number.',
    }));
    expect(screen.getByRole('button', { name: /reported/i })).toBeDisabled();
  });
});

describe('document and profile flows', () => {
  it('uses the app PDF preview without a browser frame or download control', async () => {
    render(<DocumentViewer doc={{ id: 'doc-1', title: 'Cleanup PDF', name: 'cleanup.pdf', type: 'PDF', storagePath: 'documents/doc-1' }} onClose={() => {}} />);

    expect(await screen.findByRole('document', { name: /cleanup pdf pdf preview/i })).toBeInTheDocument();
    expect(screen.queryByTitle('Cleanup PDF')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
  });

  it('shows document viewer load failures gracefully', async () => {
    mocks.getBlob.mockRejectedValueOnce(new Error('storage down'));

    render(<DocumentViewer doc={{ id: 'doc-1', title: 'Cleanup PDF', name: 'cleanup.pdf', type: 'PDF', storagePath: 'documents/doc-1' }} onClose={() => {}} />);

    expect(await screen.findByText(/could not load this document/i)).toBeInTheDocument();
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'DocumentViewer-load', { docId: 'doc-1' });
  });

  it('lets signed-in users send a profile message', async () => {
    mocks.state.auth.currentUser = { id: 'user-1', name: 'Jane', email: 'jane@example.com', moderated: false };
    renderWithProvider(<ProfilePage />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByLabelText(/topic/i), 'privacy');
    await user.type(screen.getByLabelText(/^message$/i), 'Please update my contact preferences.');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => expect(mocks.submitProfileMessageFn).toHaveBeenCalledWith({
      topic: 'privacy',
      message: 'Please update my contact preferences.',
    }));
    expect(await screen.findByText(/message sent/i)).toBeInTheDocument();
  });

  it('blocks interaction with backend progress while a profile message is sending', async () => {
    let resolveMessage: (value: unknown) => void = () => {};
    mocks.state.auth.currentUser = { id: 'user-1', name: 'Jane', email: 'jane@example.com', moderated: false };
    mocks.submitProfileMessageFn.mockReturnValueOnce(new Promise(resolve => { resolveMessage = resolve; }));
    renderWithProvider(<ProfilePage />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/^message$/i), 'Please contact me.');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByRole('status', { name: /sending your message/i })).toBeInTheDocument();
    resolveMessage({ data: { ok: true } });
    await waitFor(() => expect(screen.queryByRole('status', { name: /sending your message/i })).not.toBeInTheDocument());
  });

  it('blocks a profile upload with no file before touching storage', async () => {
    mocks.state.auth.currentUser = { id: 'user-1', name: 'Jane', email: 'jane@example.com', moderated: false };
    renderWithProvider(<ProfilePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^upload$/i }));

    expect(screen.getByText(/please choose a file/i)).toBeInTheDocument();
    expect(mocks.uploadBytes).not.toHaveBeenCalled();
  });

  it('shows a graceful upload failure after storage rejects', async () => {
    mocks.state.auth.currentUser = { id: 'user-1', name: 'Jane', email: 'jane@example.com', moderated: false };
    mocks.uploadBytes.mockRejectedValueOnce(new Error('storage down'));
    const { container } = renderWithProvider(<ProfilePage />);
    const user = userEvent.setup();
    const fileInput = container.querySelector('input[type="file"]') as HTMLElement;
    const file = new File(['pdf'], 'cleanup.pdf', { type: 'application/pdf' });

    await user.upload(fileInput, file);
    await user.click(screen.getByRole('button', { name: /^upload$/i }));

    expect(await screen.findByText(/upload failed/i)).toBeInTheDocument();
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'handleDocumentUpload', expect.objectContaining({ fileName: 'cleanup.pdf' }));
  });

  it('lets a member delete their own document and shows a confirmation signal', async () => {
    mocks.state.auth.currentUser = { id: 'user-1', name: 'Jane', email: 'jane@example.com', moderated: false };
    mocks.state.adminData.allUserDocs = [{
      id: 'doc-1', userId: 'user-1', title: 'My Packet', name: 'packet.pdf', type: 'PDF',
      status: 'approved', visibility: 'public', published: true,
    }];
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithProvider(<ProfilePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /delete my packet/i }));

    await waitFor(() => expect(mocks.deleteOwnDocumentFn).toHaveBeenCalledWith({ id: 'doc-1' }));
    expect(await screen.findByText(/was deleted/i)).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('does not delete a document when the confirmation is dismissed', async () => {
    mocks.state.auth.currentUser = { id: 'user-1', name: 'Jane', email: 'jane@example.com', moderated: false };
    mocks.state.adminData.allUserDocs = [{
      id: 'doc-1', userId: 'user-1', title: 'My Packet', name: 'packet.pdf', type: 'PDF',
      status: 'approved', visibility: 'public', published: true,
    }];
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWithProvider(<ProfilePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /delete my packet/i }));

    expect(mocks.deleteOwnDocumentFn).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('shows a graceful failure when a member document deletion fails', async () => {
    mocks.state.auth.currentUser = { id: 'user-1', name: 'Jane', email: 'jane@example.com', moderated: false };
    mocks.state.adminData.allUserDocs = [{
      id: 'doc-1', userId: 'user-1', title: 'My Packet', name: 'packet.pdf', type: 'PDF',
      status: 'approved', visibility: 'public', published: true,
    }];
    mocks.deleteOwnDocumentFn.mockRejectedValueOnce(new Error('network down'));
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithProvider(<ProfilePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /delete my packet/i }));

    expect(await screen.findByText(/could not delete the document/i)).toBeInTheDocument();
    expect(mocks.logError).toHaveBeenCalledWith(expect.any(Error), 'deleteOwnDocument', { id: 'doc-1' });
    confirmSpy.mockRestore();
  });

  it('shows an admin reply in the member message thread', () => {
    mocks.state.auth.currentUser = { id: 'user-1', name: 'Jane', email: 'jane@example.com', moderated: false };
    mocks.state.userData.myMessages = [{
      id: 'm1', topic: 'general', topicLabel: 'General question', message: 'Any updates?',
      adminReply: 'Thanks for reaching out!', adminReplyByName: 'Harbor Admin', createdAt: null, adminReplyAt: null,
    }];
    renderWithProvider(<ProfilePage />);

    expect(screen.getByText('Your Messages')).toBeInTheDocument();
    expect(screen.getByText('Any updates?')).toBeInTheDocument();
    expect(screen.getByText(/reply from harbor admin/i)).toBeInTheDocument();
    expect(screen.getByText('Thanks for reaching out!')).toBeInTheDocument();
    expect(screen.getByText('Replied')).toBeInTheDocument();
  });
});
