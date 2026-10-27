// tests/integration/newPost.test.tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const submitForumPostFn = vi.hoisted(() => vi.fn(() => Promise.resolve({ data: { id: 'post-1', status: 'approved' } })));

vi.mock('firebase/firestore', async (orig) => ({
  ...(await orig()),
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(),
  where: vi.fn(),
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
}));

vi.mock('firebase/auth', () => ({
  onIdTokenChanged: vi.fn(() => () => {}),
  signOut: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  updateProfile: vi.fn(() => Promise.resolve()),
  sendPasswordResetEmail: vi.fn(() => Promise.resolve()),
  verifyBeforeUpdateEmail: vi.fn(() => Promise.resolve()),
  reauthenticateWithCredential: vi.fn(() => Promise.resolve()),
  updatePassword: vi.fn(() => Promise.resolve()),
  EmailAuthProvider: { credential: vi.fn(() => ({})) },
}));

vi.mock('../../src/firebase', () => ({ auth: {}, db: {}, storage: {}, functions: {} }));
vi.mock('../../src/libs/callables', () => ({
  initializeAccountProfileFn: vi.fn(),
  submitVolunteerSignupFn: vi.fn(),
  subscribeMailingListFn: vi.fn(),
  submitRsvpFn: vi.fn(),
  cancelRsvpFn: vi.fn(),
  submitForumPostFn,
  submitReplyFn: vi.fn(),
  castVoteFn: vi.fn(() => Promise.resolve({ data: { votes: {} } })),
  flagContentFn: vi.fn(),
  listPublicDocumentsFn: vi.fn(() => Promise.resolve({ data: { documents: [] } })),
  createDocumentUploadTicketFn: vi.fn(),
  createDocumentRecordFn: vi.fn(),
  createAdminDocumentRecordFn: vi.fn(),
  setDocumentStatusFn: vi.fn(),
  toggleDocumentPublishedFn: vi.fn(),
  deleteDocumentRecordFn: vi.fn(),
  deleteVolunteerFn: vi.fn(),
  updateVolunteerFn: vi.fn(),
  removeMailingListEntryFn: vi.fn(),
  saveEventFn: vi.fn(),
  deleteEventFn: vi.fn(),
  approveForumPostFn: vi.fn(),
  deleteForumPostFn: vi.fn(),
  deleteForumReplyFn: vi.fn(),
  approvePendingForumReplyFn: vi.fn(),
  deletePendingForumReplyFn: vi.fn(),
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
  callableErrorMessage: (err, fallback) => (
    typeof err?.code === 'string' && err.code.startsWith('functions/')
      ? err?.message || fallback
      : fallback
  ),
}));

vi.mock('lucide-react', async () => {
  const React = await import('react');
  const Icon = React.forwardRef((props, ref) => React.createElement('svg', { ...props, ref }));
  return { __esModule: true, Loader2: Icon, X: Icon, User: Icon };
});

import { AppProvider, useApp } from '../../src/context/AppContext';
import NewPostModal from '../../src/components/modals/NewPostModal';

function Harness({ moderated }) {
  const ctx = useApp();
  return (
    <>
      <button onClick={() => { ctx.setCurrentUser({ id: 'u1', name: 'Jane', userName: 'jane', email: 'j@x.com', moderated }); ctx.setShowNewPostModal(true); }}>open</button>
      {ctx.showNewPostModal && <NewPostModal />}
    </>
  );
}

beforeEach(() => {
  submitForumPostFn.mockClear();
  submitForumPostFn.mockResolvedValue({ data: { id: 'post-1', status: 'approved' } });
});

describe('New post submission (integration)', () => {
  it('previews a numbered anonymous handle, explains admin visibility, and submits the choice', async () => {
    render(<AppProvider><Harness moderated={false} /></AppProvider>);
    await userEvent.click(screen.getByText('open'));
    await userEvent.type(screen.getByPlaceholderText('Title'), 'Private question');
    await userEvent.type(screen.getByPlaceholderText("What's on your mind?"), 'Can someone help?');
    expect(screen.getByLabelText('Post anonymously')).not.toBeChecked();
    await userEvent.click(screen.getByLabelText('Post anonymously'));
    expect(screen.getByText(/Administrators can still see your username/)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Preview post'));
    const preview = screen.getByRole('region', { name: 'Post preview' });
    expect(preview).toHaveTextContent('Anonymous 1');
    expect(preview).not.toHaveTextContent('@jane');
    await userEvent.click(screen.getByText('Edit post'));
    expect(screen.getByLabelText('Post anonymously')).toBeChecked();
    await userEvent.click(screen.getByText('Preview post'));
    await userEvent.click(screen.getByText('Create Post'));
    await waitFor(() => expect(submitForumPostFn).toHaveBeenCalledWith({ title: 'Private question', content: 'Can someone help?', anonymous: true }));
  });
  it('blocks a script payload before it reaches the callable', async () => {
    render(<AppProvider><Harness moderated={false} /></AppProvider>);
    await userEvent.click(screen.getByText('open'));
    await userEvent.type(screen.getByPlaceholderText('Title'), 'Hi');
    await userEvent.type(screen.getByPlaceholderText("What's on your mind?"), '<script>alert(1)</script>');
    await userEvent.click(screen.getByText('Preview post'));

    expect(await screen.findByText(/blocked/i)).toBeInTheDocument();
    expect(submitForumPostFn).not.toHaveBeenCalled();
  });

  it('submits a moderated user clean post through the callable', async () => {
    render(<AppProvider><Harness moderated={true} /></AppProvider>);
    await userEvent.click(screen.getByText('open'));
    await userEvent.type(screen.getByPlaceholderText('Title'), 'Cleanup');
    await userEvent.type(screen.getByPlaceholderText("What's on your mind?"), 'See you Saturday');
    await userEvent.click(screen.getByText('Preview post'));
    expect(screen.getByRole('region', { name: 'Post preview' })).toHaveTextContent('@jane');
    expect(screen.getByRole('region', { name: 'Post preview' })).not.toHaveTextContent('Jane');
    expect(submitForumPostFn).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText('Create Post'));

    await waitFor(() => expect(submitForumPostFn).toHaveBeenCalledWith({
      title: 'Cleanup',
      content: 'See you Saturday',
      anonymous: false,
    }));
  });

  it('submits a non-moderated user clean post through the callable', async () => {
    render(<AppProvider><Harness moderated={false} /></AppProvider>);
    await userEvent.click(screen.getByText('open'));
    await userEvent.type(screen.getByPlaceholderText('Title'), 'Cleanup');
    await userEvent.type(screen.getByPlaceholderText("What's on your mind?"), 'See you Saturday');
    await userEvent.click(screen.getByText('Preview post'));
    expect(submitForumPostFn).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText('Edit post'));
    expect(screen.getByPlaceholderText("What's on your mind?")).toHaveValue('See you Saturday');
    await userEvent.click(screen.getByText('Preview post'));
    await userEvent.click(screen.getByText('Create Post'));

    await waitFor(() => expect(submitForumPostFn).toHaveBeenCalledWith({
      title: 'Cleanup',
      content: 'See you Saturday',
      anonymous: false,
    }));
  });

  it('preserves the preview and draft after a failed publish', async () => {
    submitForumPostFn.mockRejectedValueOnce({ code: 'functions/unavailable', message: 'Try again later' });
    render(<AppProvider><Harness moderated={false} /></AppProvider>);
    await userEvent.click(screen.getByText('open'));
    await userEvent.type(screen.getByPlaceholderText('Title'), 'Cleanup');
    await userEvent.type(screen.getByPlaceholderText("What's on your mind?"), 'See you Saturday');
    await userEvent.click(screen.getByText('Preview post'));
    await userEvent.click(screen.getByText('Create Post'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again later');
    expect(screen.getByRole('region', { name: 'Post preview' })).toHaveTextContent('See you Saturday');
    await userEvent.click(screen.getByText('Create Post'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(submitForumPostFn).toHaveBeenCalledTimes(2);
  });
});
