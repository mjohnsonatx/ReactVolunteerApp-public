import { logger } from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { Timestamp } from 'firebase-admin/firestore';
import { runtimeConfig } from '../generatedConfig';
import { runtimeIdentity } from '../lib/runtimeIdentity';
import { db } from '../lib/firebaseAdmin';
import { cleanupDocumentUploadTicket } from '../callables/documents';

export const cleanupDocumentUploadOrphans = onSchedule(
  {
    schedule: 'every 60 minutes',
    region: runtimeConfig.region,
    serviceAccount: runtimeIdentity.media,
    retryCount: 3,
  },
  async () => {
    const expired = await db.collection('documentUploadTickets')
      .where('expiresAt', '<=', Timestamp.now())
      .limit(200)
      .get();
    if (expired.empty) return;

    const results = await Promise.allSettled(
      expired.docs.map(ticket => cleanupDocumentUploadTicket(ticket.ref)),
    );
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) {
      logger.error('Document upload orphan cleanup was incomplete', {
        attempted: results.length,
        failed: failures.length,
      });
      throw new Error(`Could not clean ${failures.length} expired document upload tickets.`);
    }
    logger.info('Cleaned expired document upload tickets', { count: results.length });
  },
);
