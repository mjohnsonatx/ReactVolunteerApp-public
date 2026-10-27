// tests/integration/recovery.test.js
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const logError = vi.hoisted(() => vi.fn());
const subscribeMailingListFn = vi.hoisted(() => vi.fn(() => Promise.reject(new Error('network down'))));

vi.mock('firebase/firestore', async (orig) => ({
  ...(await orig()),
  collection: vi.fn(() => ({})), doc: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => {}), serverTimestamp: vi.fn(), query: vi.fn(() => ({})),
  orderBy: vi.fn(), where: vi.fn(), getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
}));
vi.mock('firebase/auth', () => ({ onIdTokenChanged: vi.fn(() => () => {}), signOut: vi.fn() }));
vi.mock('../../src/firebase', () => ({ auth: {}, db: {}, storage: {}, functions: {} }));
vi.mock('../../src/libs/callables', () => ({
  initializeAccountProfileFn: vi.fn(),
  submitVolunteerSignupFn: vi.fn(),
  subscribeMailingListFn,
  submitRsvpFn: vi.fn(),
  cancelRsvpFn: vi.fn(),
  submitForumPostFn: vi.fn(),
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
vi.mock('../../src/utils/logError', () => ({ logError }));

import { AppProvider, useApp } from '../../src/context/AppContext';

function MailHarness() {
  const { handleMailingList, mailForm, setMailForm } = useApp();
  return (
    <form onSubmit={handleMailingList}>
      <input aria-label="email" value={mailForm} onChange={e => setMailForm(e.target.value)} />
      <button>subscribe</button>
    </form>
  );
}

describe('Graceful recovery when Firestore throws', () => {
  it('logs the error and does not crash on a failed subscribe', async () => {
    render(<AppProvider><MailHarness /></AppProvider>);
    await userEvent.type(screen.getByLabelText('email'), 'a@b.com');
    await userEvent.click(screen.getByText('subscribe'));

    // It tried, it failed, it logged — and the component is still mounted.
    await vi.waitFor(() => expect(logError).toHaveBeenCalledWith(expect.any(Error), 'handleMailingList'));
    expect(screen.getByText('subscribe')).toBeInTheDocument();
  });
});
