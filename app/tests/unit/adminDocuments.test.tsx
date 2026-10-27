import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({ ctx: {} as any }));

vi.mock('../../src/context/AppContext', () => ({ useApp: () => h.ctx }));
vi.mock('../../src/components/admin/AdminStorageInventory', () => ({
  default: () => <div>Storage bucket inventory</div>,
}));

import AdminDocuments from '../../src/components/admin/AdminDocuments';

beforeEach(() => {
  h.ctx = {
    allUserDocs: [],
    handleAdminUpload: vi.fn((e) => e?.preventDefault?.()),
    adminUploadForm: { title: '', notes: '', publish: true, file: null },
    setAdminUploadForm: vi.fn(),
    adminUploadError: '',
    setAdminUploadError: vi.fn(),
    adminUploadLoading: false,
    approveDoc: vi.fn(),
    rejectDoc: vi.fn(),
    setViewingDoc: vi.fn(),
    togglePublishDoc: vi.fn(),
    deleteDocRecord: vi.fn(),
    docModerationError: '',
  };
});

describe('AdminDocuments moderation feedback', () => {
  it('surfaces a moderation failure message to the admin', () => {
    h.ctx.docModerationError = 'Only approved documents can be published.';
    render(<AdminDocuments />);
    expect(screen.getByRole('alert')).toHaveTextContent(/only approved documents can be published/i);
  });

  it('does not render an alert when there is no moderation error', () => {
    render(<AdminDocuments />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/storage bucket inventory/i)).toBeInTheDocument();
  });
});
