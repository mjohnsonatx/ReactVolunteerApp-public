import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({
  currentUser: null as any, read: vi.fn(), initialize: vi.fn(), update: vi.fn(), refresh: vi.fn(), signOut: vi.fn(),
}));
vi.mock('../../src/firebase', () => ({ auth: { get currentUser() { return h.currentUser; } }, db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), getDocFromServer: h.read }));
vi.mock('../../src/libs/callables', () => ({
  initializeAccountProfileFn: h.initialize, updateAccountProfileFn: h.update,
  deleteOwnAccountDataFn: vi.fn(), syncUserEmailFn: vi.fn(), callableErrorMessage: (error: any, fallback: string) => error?.message || fallback,
}));
vi.mock('../../src/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({
  currentUser: h.currentUser, refreshUserProfile: h.refresh, handleSignOut: h.signOut,
}) }));
import ProfileSetup from '../../src/components/ProfileSetup';
import { completeAccountProfile } from '../../src/services/accountService';

beforeEach(() => {
  vi.clearAllMocks();
  h.currentUser = { uid: 'member', email: 'private@example.test', emailVerified: true, name: '', userName: '' };
  h.read.mockResolvedValue({ exists: () => false, data: () => undefined });
  h.initialize.mockResolvedValue({ data: { uid: 'member' } });
  h.update.mockResolvedValue({ data: {} });
  h.refresh.mockResolvedValue(undefined);
});

describe('verified profile completion', () => {
  it('previews the public identity without email and creates only the missing profile', async () => {
    render(<ProfileSetup />);
    expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    const preview = within(screen.getByRole('region', { name: 'Public profile preview' }));
    expect(preview.getByText('@private')).toBeInTheDocument();
    expect(preview.queryByText('private@example.test')).not.toBeInTheDocument();
    expect(h.initialize).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Save profile and continue' }));
    await waitFor(() => expect(h.initialize).toHaveBeenCalledWith({}));
    expect(h.update).not.toHaveBeenCalled();
    expect(h.refresh).toHaveBeenCalledTimes(1);
  });

  it('updates an existing incomplete profile without replacing its metadata', async () => {
    h.read.mockResolvedValue({ exists: () => true, data: () => ({ moderated: true }) });
    await completeAccountProfile({ userName: 'member' });
    expect(h.update).toHaveBeenCalledWith({ name: 'member', userName: 'member' });
    expect(h.initialize).not.toHaveBeenCalled();
  });

  it.each(['unverified', 'deleting', 'read-error'])('does not initialize on %s', async mode => {
    if (mode === 'unverified') h.currentUser.emailVerified = false;
    if (mode === 'deleting') h.read.mockResolvedValue({ exists: () => true, data: () => ({ accountStatus: 'deleting' }) });
    if (mode === 'read-error') h.read.mockRejectedValue(new Error('offline'));
    await expect(completeAccountProfile({ userName: 'member' })).rejects.toThrow();
    expect(h.initialize).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });

  it('keeps the email-based preview and allows retry after a setup error', async () => {
    h.initialize.mockRejectedValueOnce(new Error('Temporarily unavailable.'));
    render(<ProfileSetup />);
    await userEvent.click(screen.getByRole('button', { name: 'Save profile and continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Temporarily unavailable');
    expect(screen.getByText('@private')).toBeInTheDocument();
    expect(h.refresh).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Save profile and continue' }));
    await waitFor(() => expect(h.refresh).toHaveBeenCalledTimes(1));
  });

  it('uses server allocation for existing incomplete profiles without a client-picked username', async () => {
    h.read.mockResolvedValue({ exists: () => true, data: () => ({ moderated: true }) });
    await completeAccountProfile();
    expect(h.initialize).toHaveBeenCalledWith({});
    expect(h.update).not.toHaveBeenCalled();
  });

  it.each(['', 'ab', '!!!'])('rejects invalid username %j before calling the backend', async userName => {
    await expect(completeAccountProfile({ userName })).rejects.toThrow(/user name/i);
    expect(h.initialize).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });
});
