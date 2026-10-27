import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({
  ctx: {} as any,
  fetchAll: vi.fn(),
  exportAll: vi.fn(),
}));

vi.mock('../../src/context/AppContext', () => ({ useApp: () => h.ctx }));
vi.mock('../../src/services/adminLogs', () => ({
  fetchAllAdminLogs: h.fetchAll,
  exportAllAdminLogs: h.exportAll,
}));

import AdminLogs from '../../src/components/admin/AdminLogs';

beforeEach(() => {
  h.fetchAll.mockReset();
  h.exportAll.mockReset();
  h.ctx = {
    adminAuditLogs: [{
      id: 'a1', action: 'forum-post.delete', summary: 'Deleted forum post', actorEmail: 'admin@example.test',
      resourceType: 'forum-post', tags: ['admin-action', 'forum-post'], createdAt: { toMillis: () => 200 },
    }],
    errorLogs: [{
      id: 'e1', context: 'event-load', message: 'Could not load event', tags: ['error', 'event'],
      createdAt: { toMillis: () => 100 },
    }],
  };
});

describe('AdminLogs', () => {
  it('shows the verified administrator and filters by tag', async () => {
    render(<AdminLogs />);
    expect(screen.getByText(/admin@example\.test/)).toBeInTheDocument();
    expect(screen.getByText('Deleted forum post')).toBeInTheDocument();
    expect(screen.getByText('Could not load event')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'error (1)' }));
    expect(screen.queryByText('Deleted forum post')).not.toBeInTheDocument();
    expect(screen.getByText('Could not load event')).toBeInTheDocument();
  });

  it('pulls all logs and exports a complete CSV on request', async () => {
    h.fetchAll.mockResolvedValue([]);
    h.exportAll.mockResolvedValue({ count: 42, filename: 'logs.csv' });
    render(<AdminLogs />);

    await userEvent.click(screen.getByRole('button', { name: /load all/i }));
    expect(h.fetchAll).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/loaded all 0 log entries/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /export all csv/i }));
    expect(h.exportAll).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/downloaded 42 entries as logs.csv/i)).toBeInTheDocument();
  });

  it('keeps receiving live errors after loading history and clears restrictive filters', async () => {
    h.fetchAll.mockResolvedValue([]);
    const { rerender } = render(<AdminLogs />);
    await userEvent.click(screen.getByRole('button', { name: /load all/i }));
    await screen.findByText(/loaded all 0 log entries/i);
    h.ctx = { ...h.ctx, errorLogs: [...h.ctx.errorLogs, {
      id: 'new-error', context: 'AccountSettings-saveProfile', message: 'Your account profile is unavailable.',
      actorEmail: 'member@example.test', createdAt: 300,
    }] };
    rerender(<AdminLogs />);
    expect(screen.getByText('Your account profile is unavailable.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'account-profile (1)' }));
    expect(screen.queryByText('Deleted forum post')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('Deleted forum post')).toBeInTheDocument();
  });
});
