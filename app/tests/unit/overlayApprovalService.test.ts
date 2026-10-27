import { beforeEach, describe, expect, it, vi } from 'vitest';

const approveOverlayUploadFn = vi.fn();
const rejectOverlayUploadFn = vi.fn();
const deleteOverlayUploadFn = vi.fn();
const toggleOverlayPublishedFn = vi.fn();

vi.mock('../../src/libs/callables', () => ({
  approveOverlayUploadFn,
  rejectOverlayUploadFn,
  deleteOverlayUploadFn,
  toggleOverlayPublishedFn,
}));

const {
  approveUpload,
  rejectUpload,
  deleteUpload,
  togglePublished,
} = await import('../../src/services/overlayApprovalService');

beforeEach(() => vi.clearAllMocks());

describe('overlayApprovalService', () => {
  it('approves an upload through the callable and returns the deployed overlay id', async () => {
    approveOverlayUploadFn.mockResolvedValue({ data: { id: 'overlay1' } });

    await expect(approveUpload('up1')).resolves.toBe('overlay1');
    expect(approveOverlayUploadFn).toHaveBeenCalledWith({ uploadId: 'up1' });
  });

  it('rejects an upload through the callable', async () => {
    rejectOverlayUploadFn.mockResolvedValue({ data: { ok: true } });

    await rejectUpload('up1', 'Looks wrong');
    expect(rejectOverlayUploadFn).toHaveBeenCalledWith({ uploadId: 'up1', note: 'Looks wrong' });
  });

  it('deletes an upload through the callable', async () => {
    deleteOverlayUploadFn.mockResolvedValue({ data: { ok: true } });

    await deleteUpload('up1');
    expect(deleteOverlayUploadFn).toHaveBeenCalledWith({ uploadId: 'up1' });
  });

  it('toggles active overlay visibility through the callable', async () => {
    toggleOverlayPublishedFn.mockResolvedValue({ data: { published: false } });

    await togglePublished('overlay1');
    expect(toggleOverlayPublishedFn).toHaveBeenCalledWith({ id: 'overlay1' });
  });

  it('lets callable failures surface to the caller', async () => {
    deleteOverlayUploadFn.mockRejectedValue(new Error('fail'));

    await expect(deleteUpload('up1')).rejects.toThrow('fail');
  });
});
