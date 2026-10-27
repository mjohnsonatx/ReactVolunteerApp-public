import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ currentUser: null as any, save: vi.fn(), setUser: vi.fn() }));
vi.mock('../../src/context/AppContext', () => ({ useApp: () => ({
  currentUser: h.currentUser, setCurrentUser: h.setUser,
  runBackendTask: (_message: string, task: () => Promise<unknown>) => task(),
}) }));
vi.mock('../../src/services/accountService', () => ({ updateAccountProfile: h.save, requestPasswordReset: vi.fn() }));
vi.mock('../../src/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('../../src/components/modals/ChangeEmailModal', () => ({ default: () => null }));
vi.mock('../../src/components/modals/ChangePasswordModal', () => ({ default: () => null }));
vi.mock('../../src/components/modals/DeleteAccountModal', () => ({ default: () => null }));
import AccountSettings from '../../src/components/user/AccountSettings';
import { AccountError } from '../../src/services/accountErrors';

beforeEach(() => {
  vi.clearAllMocks();
  h.currentUser = { id: 'member', name: 'Legacy Private Name', userName: 'river-friend', email: 'private@example.test' };
  h.save.mockResolvedValue({ name: 'new-username', userName: 'new-username' });
  h.setUser.mockImplementation(user => { h.currentUser = user; });
});

describe('username-only account settings', () => {
  it('edits and displays only the username, including existing accounts with a separate name', async () => {
    render(<AccountSettings />);
    expect(screen.getByText('@river-friend')).toBeInTheDocument();
    expect(screen.queryByText('Legacy Private Name')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument();
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    const username = screen.getByLabelText('Username');
    await userEvent.clear(username);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.type(username, 'new-username');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(h.save).toHaveBeenCalledWith({ userName: 'new-username' }));
    expect(await screen.findByText('@new-username')).toBeInTheDocument();
    expect(h.setUser).toHaveBeenCalledWith(expect.objectContaining({ email: 'private@example.test', userName: 'new-username' }));
  });

  it('keeps the username available for correction when saving fails', async () => {
    h.save.mockRejectedValue(new AccountError('account/invalid-username', 'This username is already taken.'));
    render(<AccountSettings />);
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('This username is already taken.')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveValue('river-friend');
    expect(h.setUser).not.toHaveBeenCalled();
  });
});
