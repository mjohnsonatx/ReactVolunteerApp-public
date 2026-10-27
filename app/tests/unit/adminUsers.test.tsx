import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({
  ctx: { allUsers: [] as any[], openProfileForUser: vi.fn() },
}));

vi.mock('../../src/context/AppContext', () => ({
  useApp: () => h.ctx,
}));

import AdminUsers from '../../src/components/admin/AdminUsers';

const sampleUsers = [
  { id: 'u1', name: 'Alice Rivera', userName: 'alice', email: 'alice@example.test', role: 'user', moderated: false },
  { id: 'u2', name: 'Bob Stone', userName: 'bobby', email: 'bob@example.test', role: 'user', moderated: true },
  { id: 'u3', name: 'Carol Admin', userName: 'carol', email: 'carol@example.test', role: 'admin', moderated: false },
];

beforeEach(() => {
  h.ctx.allUsers = sampleUsers.map(u => ({ ...u }));
  h.ctx.openProfileForUser = vi.fn();
});

describe('AdminUsers registered directory', () => {
  it('lists every registered user with a count', () => {
    render(<AdminUsers />);
    expect(screen.getByText('Registered Users (3)')).toBeInTheDocument();
    expect(screen.getByText('@alice')).toBeInTheDocument();
    expect(screen.getByText('@bobby')).toBeInTheDocument();
    expect(screen.getByText('@carol')).toBeInTheDocument();
    expect(screen.queryByText('Alice Rivera')).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Name' })).not.toBeInTheDocument();
  });

  it('filters the directory by username or email', async () => {
    render(<AdminUsers />);
    const user = userEvent.setup();
    const input = screen.getByLabelText(/search users/i);

    await user.type(input, 'bobby');
    expect(screen.getByText('@bobby')).toBeInTheDocument();
    expect(screen.queryByText('@alice')).not.toBeInTheDocument();

    await user.clear(input);
    await user.type(input, 'carol@example');
    expect(screen.getByText('@carol')).toBeInTheDocument();
    expect(screen.queryByText('@bobby')).not.toBeInTheDocument();
  });

  it('opens the profile of a user whose row is clicked', async () => {
    render(<AdminUsers />);
    const user = userEvent.setup();
    await user.click(screen.getByText('@alice'));
    expect(h.ctx.openProfileForUser).toHaveBeenCalledWith('u1');
  });

  it('shows a helpful message when no users match the search', async () => {
    render(<AdminUsers />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/search users/i), 'zzznomatch');
    expect(screen.getByText(/no users match/i)).toBeInTheDocument();
  });

  it('renders an empty state when there are no registered users', () => {
    h.ctx.allUsers = [];
    render(<AdminUsers />);
    expect(screen.getByText(/no registered users yet/i)).toBeInTheDocument();
  });
});
