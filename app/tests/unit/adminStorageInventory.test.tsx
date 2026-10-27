import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchAll: vi.fn(),
  setPublished: vi.fn(),
}));

vi.mock('../../src/services/adminStorage', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/services/adminStorage')>();
  return {
    ...original,
    fetchAllAdminStorageObjects: mocks.fetchAll,
    setAdminStorageObjectPublished: mocks.setPublished,
  };
});

vi.mock('../../src/libs/callables', () => ({
  callableErrorMessage: (cause: unknown, fallback: string) => (
    typeof (cause as { message?: unknown })?.message === 'string'
      ? String((cause as { message: string }).message)
      : fallback
  ),
}));

import AdminStorageInventory from '../../src/components/admin/AdminStorageInventory';

beforeEach(() => {
  mocks.fetchAll.mockReset();
  mocks.setPublished.mockReset();
});

describe('AdminStorageInventory', () => {
  it('shows every bucket object and can quarantine a preserved original', async () => {
    mocks.fetchAll.mockResolvedValue([
      {
        name: 'documents/admin/redacted.pdf', category: 'documents', contentType: 'application/pdf', sizeBytes: 100,
        createdAt: '', updatedAt: '', published: true, role: 'document', hasDownloadToken: false, downloadTokenRotatedAt: '',
        documentId: 'doc-1', documentTitle: 'Restoration Plan', linkRole: 'current-document', recordPublished: true,
      },
      {
        name: 'documents/admin/original-signed.pdf', category: 'documents', contentType: 'application/pdf', sizeBytes: 200,
        createdAt: '', updatedAt: '', published: true, role: '', hasDownloadToken: true, downloadTokenRotatedAt: '',
        documentId: 'doc-1', documentTitle: 'Restoration Plan', linkRole: 'preserved-original', recordPublished: true,
      },
      {
        name: 'events/event-1/photo.webp', category: 'events', contentType: 'image/webp', sizeBytes: 300,
        createdAt: '', updatedAt: '', published: false, role: '', hasDownloadToken: false, downloadTokenRotatedAt: '',
        documentId: '', documentTitle: '', linkRole: '', recordPublished: false,
      },
    ]);
    mocks.setPublished.mockResolvedValue({
      path: 'documents/admin/original-signed.pdf', published: false, hasDownloadToken: true,
      downloadTokensRevoked: true, downloadTokenRotatedAt: '2026-10-15T12:00:00.000Z',
    });
    const onPreview = vi.fn();
    render(<AdminStorageInventory onPreview={onPreview} />);

    expect(await screen.findByRole('heading', { name: /storage bucket \(3\)/i })).toBeInTheDocument();
    expect(screen.getByText('documents/admin/redacted.pdf')).toBeInTheDocument();
    expect(screen.getByText('documents/admin/original-signed.pdf')).toBeInTheDocument();
    expect(screen.getByText('events/event-1/photo.webp')).toBeInTheDocument();
    expect(screen.getByText('Current document')).toBeInTheDocument();
    expect(screen.getByText('Preserved original')).toBeInTheDocument();
    expect(screen.getByText('Managed above')).toBeInTheDocument();
    expect(screen.getByText('Rule-managed')).toBeInTheDocument();

    const originalRow = screen.getByText('documents/admin/original-signed.pdf').closest('tr');
    expect(originalRow).not.toBeNull();
    const user = userEvent.setup();
    await user.click(within(originalRow!).getByRole('button', { name: /make private/i }));
    await waitFor(() => expect(mocks.setPublished).toHaveBeenCalledWith('documents/admin/original-signed.pdf', false));
    expect(await screen.findByText(/revoked its previous firebase download links/i)).toBeInTheDocument();
    expect(within(originalRow!).getByText(/private; prior links revoked/i)).toBeInTheDocument();

    await user.click(within(originalRow!).getByRole('button', { name: /preview documents\/admin\/original-signed\.pdf/i }));
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({
      type: 'PDF',
      storagePath: 'documents/admin/original-signed.pdf',
    }));
  });

  it('reports inventory loading failures', async () => {
    mocks.fetchAll.mockRejectedValue(new Error('Inventory unavailable'));
    render(<AdminStorageInventory onPreview={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/inventory unavailable/i);
  });
});
