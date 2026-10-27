import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ ctx: {} as any }));

vi.mock('../../src/context/AppContext', () => ({ useApp: () => h.ctx }));
vi.mock('../../src/utils/logError', () => ({ logError: vi.fn() }));

import AdminDashboard from '../../src/components/admin/AdminDashboard';

function baseCtx(overrides: Record<string, unknown> = {}) {
  return {
    events: [],
    forumPosts: [],
    adminRsvps: [],
    allUserDocs: [],
    volunteers: [],
    mailingList: [],
    pendingDocsCount: 0,
    flaggedPostsCount: 0,
    flaggedRepliesCount: 0,
    allUsers: [],
    errorLogs: [],
    profileMessages: [],
    setAdminTab: vi.fn(),
    setAdminViewThread: vi.fn(),
    setViewingDoc: vi.fn(),
    replyToProfileMessage: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

const message = {
  id: 'm1',
  topic: 'general',
  topicLabel: 'General question',
  message: 'Any updates on the cleanup?',
  userName: 'Member One',
  createdAt: null,
};

beforeEach(() => {
  h.ctx = baseCtx({ profileMessages: [message] });
});

describe('AdminDashboard admin -> member messaging', () => {
  it('sends an admin reply to a member message and confirms it', async () => {
    render(<AdminDashboard />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^reply$/i }));
    await user.type(screen.getByLabelText(/reply to member one/i), 'Thanks for reaching out!');
    await user.click(screen.getByRole('button', { name: /send reply/i }));

    await waitFor(() => expect(h.ctx.replyToProfileMessage).toHaveBeenCalledWith('m1', 'Thanks for reaching out!'));
    expect(await screen.findByText(/reply sent/i)).toBeInTheDocument();
  });

  it('shows a graceful failure when the reply cannot be sent', async () => {
    h.ctx = baseCtx({
      profileMessages: [message],
      replyToProfileMessage: vi.fn(() => Promise.reject(new Error('network down'))),
    });
    render(<AdminDashboard />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^reply$/i }));
    await user.type(screen.getByLabelText(/reply to member one/i), 'Thanks!');
    await user.click(screen.getByRole('button', { name: /send reply/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/network down/i);
  });

  it('requires reply text before sending', async () => {
    render(<AdminDashboard />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /^reply$/i }));
    await user.click(screen.getByRole('button', { name: /send reply/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/please enter a reply/i);
    expect(h.ctx.replyToProfileMessage).not.toHaveBeenCalled();
  });

  it('shows an existing admin reply on the message', () => {
    h.ctx = baseCtx({
      profileMessages: [{ ...message, adminReply: 'Already answered.', status: 'replied' }],
    });
    render(<AdminDashboard />);
    expect(screen.getByText('Already answered.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reply again/i })).toBeInTheDocument();
  });
});
