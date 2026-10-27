/**
 * Firestore document in the `overlayUploads` collection.
 * Written by the overlay builder, read/updated by the volunteer admin.
 */
export interface OverlayUploadDoc {
  id: string;
  name: string;
  description: string;
  color: string;
  geojson: string;
  featureCount: number;
  uploadedBy: string;
  uploadedByEmail: string;
  uploadedAt: any; // Firestore Timestamp
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: any;
  reviewNote?: string;
  deployedOverlayId?: string;
}

export function isOverlayUploadDoc(v: unknown): v is Omit<OverlayUploadDoc, 'id'> {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    typeof d.name === 'string' &&
    typeof d.geojson === 'string' &&
    typeof d.featureCount === 'number' &&
    typeof d.uploadedBy === 'string' &&
    typeof d.status === 'string' &&
    ['pending', 'approved', 'rejected'].includes(d.status as string)
  );
}