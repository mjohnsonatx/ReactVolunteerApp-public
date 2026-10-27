import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultNotificationPreferences } from '@watershed/shared';

const h = vi.hoisted(() => ({
  ctx: {} as any,
  support: 'supported',
  deviceEnabled: false,
  load: vi.fn(),
  save: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
}));

vi.mock('../../src/context/AppContext', () => ({ useApp: () => h.ctx }));
vi.mock('../../src/utils/logError', () => ({ logError: vi.fn() }));
vi.mock('../../src/services/notifications', () => ({
  loadNotificationSettings: h.load,
  saveNotificationPreferences: h.save,
  enablePushOnThisDevice: h.enable,
  disablePushOnThisDevice: h.disable,
  refreshPushRegistration: vi.fn(() => Promise.resolve()),
  pushSupport: () => h.support,
  isPushEnabledOnThisDevice: () => h.deviceEnabled,
  notificationErrorMessage: (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback),
}));

import NotificationSettings from '../../src/components/user/NotificationSettings';

beforeEach(() => {
  h.ctx = { currentUser: { id: 'u1', email: 'member@example.com', emailVerified: true } };
  h.support = 'supported';
  h.deviceEnabled = false;
  h.load.mockReset().mockResolvedValue({ preferences: defaultNotificationPreferences(), digestAvailable: true, pushDevices: 0 });
  h.save.mockReset().mockImplementation(async (prefs) => prefs);
  h.enable.mockReset().mockImplementation(async () => { h.deviceEnabled = true; });
  h.disable.mockReset().mockResolvedValue(undefined);
});

describe('NotificationSettings', () => {
  it('shows only push choices and saves a topic choice as soon as it is toggled', async () => {
    const user = userEvent.setup();
    render(<NotificationSettings />);

    const box = await screen.findByLabelText('Push: Replies to my forum threads');
    expect(box).not.toBeChecked();
    expect(screen.queryByText('Daily email')).not.toBeInTheDocument();
    await user.click(box);

    await waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    expect(h.save.mock.calls[0][0].forumReplies).toEqual({ push: true, digest: false });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(screen.getByText(/push updates need at least one device/i)).toBeInTheDocument();
  });

  it('rolls back and explains when saving fails', async () => {
    h.save.mockRejectedValueOnce(new Error('Too many requests.'));
    const user = userEvent.setup();
    render(<NotificationSettings />);

    const box = await screen.findByLabelText('Push: New volunteer events');
    await user.click(box);

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests.');
    expect(box).not.toBeChecked();
  });

  it('turns push on for this device from a click', async () => {
    const user = userEvent.setup();
    render(<NotificationSettings />);

    await user.click(await screen.findByRole('button', { name: /turn on/i }));
    await waitFor(() => expect(h.enable).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: /turn off/i })).toBeInTheDocument();
    expect(screen.getByText(/choose which updates to push in the settings below/i)).toBeInTheDocument();
  });

  it('tells iPhone visitors to add the site to the Home Screen first', async () => {
    h.support = 'needs-install';
    render(<NotificationSettings />);
    expect(await screen.findByText(/add to home screen/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /turn on/i })).not.toBeInTheDocument();
  });

  it('requires a verified email to change push settings', async () => {
    h.ctx = { currentUser: { id: 'u1', email: 'member@example.com', emailVerified: false } };
    h.load.mockResolvedValue({ preferences: defaultNotificationPreferences(), digestAvailable: false, pushDevices: 0 });
    render(<NotificationSettings />);

    expect(await screen.findByText(/verify your email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Push: New forum posts')).toBeDisabled();
    expect(screen.queryByText('Daily email')).not.toBeInTheDocument();
  });
});
