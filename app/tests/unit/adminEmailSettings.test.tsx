import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({
  ctx: { isAdmin: true } as any,
  load: vi.fn(),
  save: vi.fn(),
  test: vi.fn(),
}));

vi.mock('@runtime/app-context', () => ({ useApp: () => h.ctx }));
vi.mock('../../src/libs/callables', () => ({
  callableErrorMessage: (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback),
}));
vi.mock('../../src/services/emailDelivery', () => ({
  loadEmailDeliverySettings: h.load,
  saveEmailDeliverySettings: h.save,
  sendTestEmail: h.test,
}));

import AdminEmailSettings from '../../src/components/admin/AdminEmailSettings';

const stored = {
  senderAddress: '',
  senderName: 'WatershedCrew',
  digestEnabled: false,
  smtpConfigured: false,
  lastDigestRunAt: null,
  lastDigestStatus: '',
  lastDigestSent: 0,
  lastDigestFailed: 0,
};

beforeEach(() => {
  h.ctx = { isAdmin: true };
  h.load.mockReset().mockResolvedValue(stored);
  h.save.mockReset().mockImplementation(async (form) => form);
  h.test.mockReset().mockResolvedValue('admin@example.com');
});

describe('AdminEmailSettings', () => {
  it('never offers an SMTP key field and reports when the secret is missing', async () => {
    render(<AdminEmailSettings />);
    expect(await screen.findByText(/Brevo SMTP is not configured yet/i)).toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.getByRole('button', { name: /send me a test email/i })).toBeDisabled();
  });

  it('saves the sender address and digest switch', async () => {
    const user = userEvent.setup();
    render(<AdminEmailSettings />);

    await user.type(await screen.findByLabelText(/verified sender address/i), 'no-reply@tillerystreetvolunteers.org');
    await user.click(screen.getByLabelText(/send the daily digest/i));
    await user.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => expect(h.save).toHaveBeenCalledWith({ senderAddress: 'no-reply@tillerystreetvolunteers.org', senderName: 'WatershedCrew', digestEnabled: true }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Email settings saved.'));
  });

  it('sends a test email once the saved settings are complete', async () => {
    h.load.mockResolvedValue({ ...stored, senderAddress: 'no-reply@tillerystreetvolunteers.org', smtpConfigured: true, digestEnabled: true });
    const user = userEvent.setup();
    render(<AdminEmailSettings />);

    await user.click(await screen.findByRole('button', { name: /send me a test email/i }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/test email sent to admin@example.com/i));
  });

  it('renders nothing for non-admins', () => {
    h.ctx = { isAdmin: false };
    const { container } = render(<AdminEmailSettings />);
    expect(container).toBeEmptyDOMElement();
    expect(h.load).not.toHaveBeenCalled();
  });
});
