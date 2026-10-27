// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({ ctx: {} as any }));

vi.mock('@runtime/app-context', () => ({ useApp: () => h.ctx }));
vi.mock('./Overview', () => ({ default: () => <div>Overview page</div> }));
vi.mock('@app/components/admin/AdminUsers', () => ({ default: () => <div>Users page</div> }));
vi.mock('@app/components/admin/AdminVolunteers', () => ({ default: () => <div>Volunteers page</div> }));
vi.mock('@app/components/admin/AdminEvents', () => ({ default: () => <div>Events page</div> }));
vi.mock('@app/components/admin/AdminPolls', () => ({ default: () => <div>Polls page</div> }));
vi.mock('@app/components/admin/AdminOverlays', () => ({ default: () => <div>Overlays page</div> }));
vi.mock('@app/components/admin/AdminDocuments', () => ({ default: () => <div>Documents page</div> }));
vi.mock('@app/components/admin/AdminForum', () => ({ default: () => <div>Forum page</div> }));
vi.mock('@app/components/admin/AdminMailing', () => ({ default: () => <div>Mailing page</div> }));
vi.mock('@app/components/admin/AdminContent', () => ({ default: () => <div>Content page</div> }));
vi.mock('@app/components/admin/AdminLogs', () => ({ default: () => <div>Combined log page</div> }));
vi.mock('@app/components/modals/EventFormModal', () => ({ default: () => null }));
vi.mock('@app/components/modals/ImportOverlayModal', () => ({ default: () => null }));
vi.mock('@app/components/modals/UserProfileModal', () => ({ default: () => null }));

import DesktopShell from './DesktopShell';

beforeEach(() => {
  h.ctx = {
    adminTab: 'dashboard',
    setAdminTab: vi.fn((tab: string) => { h.ctx.adminTab = tab; }),
    setAdminViewThread: vi.fn(),
    setAdminViewUser: vi.fn(),
    adminBadges: { dashboard: 0, events: 0, logs: 0 },
    currentUser: { name: 'Admin One', userName: 'admin-one', email: 'admin@example.test' },
    handleSignOut: vi.fn(),
    showEventModal: false,
    showImportModal: false,
    adminProfileUser: null,
  };
});

describe('DesktopShell navigation', () => {
  it('renders the administrator identity and opens the shared Logs panel', () => {
    const view = render(<DesktopShell />);
    expect(screen.getByText('admin-one')).not.toBeNull();
    expect(screen.queryByText('Admin One')).toBeNull();
    expect(screen.getByText('Overview page')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Logs' }));
    expect(h.ctx.setAdminTab).toHaveBeenCalledWith('logs');
    view.rerender(<DesktopShell />);

    expect(screen.getByRole('heading', { name: 'Logs' })).not.toBeNull();
    expect(screen.getByText('Administrator actions and client errors')).not.toBeNull();
    expect(screen.getByText('Combined log page')).not.toBeNull();
  });
});
