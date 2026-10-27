import {
  approveOverlayUploadFn,
  deleteOverlayUploadFn,
  rejectOverlayUploadFn,
  toggleOverlayPublishedFn,
} from '../libs/callables';

export async function approveUpload(uploadId: string): Promise<string> {
  const res = await approveOverlayUploadFn({ uploadId });
  return (res.data as { id?: string }).id || '';
}

export async function rejectUpload(uploadId: string, note: string): Promise<void> {
  await rejectOverlayUploadFn({ uploadId, note });
}

export async function deleteUpload(uploadId: string): Promise<void> {
  await deleteOverlayUploadFn({ uploadId });
}

export async function togglePublished(overlayId: string): Promise<void> {
  await toggleOverlayPublishedFn({ id: overlayId });
}
