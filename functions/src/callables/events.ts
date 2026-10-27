import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { callableOptions } from '../lib/options';
import { requireAuth, requireVerifiedEmail } from '../lib/guards';
import { enforceRateLimit } from '../lib/rateLimiter';
import { db } from '../lib/firebaseAdmin';
import { sanitizeRsvpForm, detectMalicious } from '../shared';

export const submitRsvp = onCall(callableOptions, async (request) => {
  const { uid } = requireVerifiedEmail(request);
  await enforceRateLimit({ key: `rsvp:${uid}`, max: 20, windowSeconds: 3600 });

  const eventId = request.data?.eventId;
  if (typeof eventId !== 'string' || !eventId) throw new HttpsError('invalid-argument', 'Missing event.');

  const eventSnap = await db.collection('events').doc(eventId).get();
  if (!eventSnap.exists) throw new HttpsError('not-found', 'Event not found.');

  const clean = sanitizeRsvpForm(request.data ?? {});
  if (!clean.name) throw new HttpsError('invalid-argument', 'Please enter a valid name.');
  if (!clean.email) throw new HttpsError('invalid-argument', 'Please enter a valid email address.');
  const m = detectMalicious(clean.comments);
  if (m.blocked) throw new HttpsError('invalid-argument', `Invalid content: ${m.reason}`);

  const dup = await db.collection('rsvps')
    .where('userId', '==', uid).where('eventId', '==', eventId).limit(1).get();
  if (!dup.empty) throw new HttpsError('already-exists', 'You have already RSVPed to this event.');

  const ref = await db.collection('rsvps').add({
    eventId, ...clean, userId: uid, createdAt: FieldValue.serverTimestamp(),
  });
  return { id: ref.id };
});

export const cancelRsvp = onCall(callableOptions, async (request) => {
  const { uid } = requireAuth(request);
  const rsvpId = request.data?.rsvpId;
  if (typeof rsvpId !== 'string' || !rsvpId) throw new HttpsError('invalid-argument', 'Missing RSVP id.');

  const ref = db.collection('rsvps').doc(rsvpId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true };
  if (snap.data()?.userId !== uid) throw new HttpsError('permission-denied', 'Not your RSVP.');

  await ref.delete();
  return { ok: true };
});
