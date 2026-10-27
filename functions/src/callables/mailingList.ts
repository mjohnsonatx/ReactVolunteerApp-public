import { onCall } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { callableOptions } from '../lib/options';
import { requireAdmin } from '../lib/guards';
import { enforceRateLimit } from '../lib/rateLimiter';
import { db } from '../lib/firebaseAdmin';
import { recordAdminAction } from '../lib/adminAudit';
import {
  buildMailingListCsv,
  mailingListCsvFileName,
  sanitizeEmail,
  type MailingListExportRow,
} from '../shared';

const EXPORT_LIMIT = 5000;

function isoDate(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? '' : new Date(parsed).toISOString();
  }
  return '';
}

function subscriptionStatus(data: FirebaseFirestore.DocumentData): string {
  const status = typeof data.status === 'string' ? data.status.trim().toLowerCase() : '';
  if (status) return status;
  if (data.unsubscribedAt) return 'unsubscribed';
  return 'subscribed';
}

// Admin-only CSV export. Every field is run through the shared CSV escaper so
// a subscriber address such as `=cmd|' /C calc'!A0` cannot become a formula
// when the file is opened in Excel / Sheets / LibreOffice.
export const exportMailingListCsv = onCall(callableOptions, async (request) => {
  const { uid } = requireAdmin(request);
  await enforceRateLimit({ key: `mailingListExport:${uid}`, max: 20, windowSeconds: 3600 });

  const snap = await db.collection('mailingList').limit(EXPORT_LIMIT).get();
  const rows: MailingListExportRow[] = snap.docs
    .map((doc) => {
      const data = doc.data();
      // Keep the raw stored value when it is not a valid address so the admin
      // can spot bad data; sanitizeEmail() is used purely for normalization.
      const email = sanitizeEmail(data.email) || String(data.email ?? '');
      return {
        email,
        subscribedAt: isoDate(data.addedAt ?? data.subscribedAt ?? data.createdAt),
        status: subscriptionStatus(data),
      };
    })
    .sort((a, b) => (a.subscribedAt < b.subscribedAt ? 1 : a.subscribedAt > b.subscribedAt ? -1 : 0));

  const generatedAt = new Date();
  await recordAdminAction(request, {
    action: 'mailing-list.export', summary: 'Exported mailing list', resourceType: 'mailing-list',
    details: { count: rows.length, truncated: snap.size >= EXPORT_LIMIT },
  });
  return {
    csv: buildMailingListCsv(rows),
    filename: mailingListCsvFileName(generatedAt),
    count: rows.length,
    generatedAt: generatedAt.toISOString(),
    truncated: snap.size >= EXPORT_LIMIT,
  };
});
