import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { callableOptions } from '../lib/options';
import { clientIp, requireAuth } from '../lib/guards';
import { enforceRateLimit } from '../lib/rateLimiter';
import { db } from '../lib/firebaseAdmin';
import {
  LIMITS,
  detectMalicious,
  enforceLimit,
  sanitizeEmail,
  sanitizeMultiline,
  sanitizeText,
  sanitizeVolunteerForm,
} from '../shared';

const PROFILE_MESSAGE_TOPICS = new Map([
  ['general', 'General question'],
  ['volunteering', 'Volunteering'],
  ['events', 'Events'],
  ['documents', 'Documents'],
  ['account', 'Account help'],
  ['privacy', 'Privacy request'],
  ['technical', 'Technical issue'],
]);

export const submitVolunteerSignup = onCall(callableOptions, async (request) => {
  await enforceRateLimit({ key: `volunteerSignup:${clientIp(request)}`, max: 5, windowSeconds: 3600 });

  const clean = sanitizeVolunteerForm(request.data ?? {});
  if (!clean.name) throw new HttpsError('invalid-argument', 'Please enter a valid name.');
  if (!clean.email) throw new HttpsError('invalid-argument', 'Please enter a valid email address.');
  const m = detectMalicious(clean.name);
  if (m.blocked) throw new HttpsError('invalid-argument', `Invalid input: ${m.reason}`);

  await db.collection('volunteers').add({ ...clean, joinDate: FieldValue.serverTimestamp() });
  return { ok: true };
});

export const subscribeMailingList = onCall(callableOptions, async (request) => {
  await enforceRateLimit({ key: `mailingList:${clientIp(request)}`, max: 5, windowSeconds: 3600 });

  const email = sanitizeEmail(request.data?.email);
  if (!email) throw new HttpsError('invalid-argument', 'Please enter a valid email address.');

  const existing = await db.collection('mailingList').where('email', '==', email).limit(1).get();
  if (existing.empty) {
    await db.collection('mailingList').add({ email, addedAt: FieldValue.serverTimestamp() });
  }
  return { ok: true };
});

export const submitProfileMessage = onCall(callableOptions, async (request) => {
  const { uid, token } = requireAuth(request);
  await enforceRateLimit({ key: `profileMessage:${uid}`, max: 10, windowSeconds: 3600 });

  const topic = sanitizeText(request.data?.topic).toLowerCase();
  const topicLabel = PROFILE_MESSAGE_TOPICS.get(topic);
  if (!topicLabel) throw new HttpsError('invalid-argument', 'Please choose a valid topic.');

  const message = enforceLimit(sanitizeMultiline(request.data?.message), LIMITS.comment);
  if (!message) throw new HttpsError('invalid-argument', 'Please enter a message.');

  const messageCheck = detectMalicious(message);
  if (messageCheck.blocked) throw new HttpsError('invalid-argument', `Invalid message: ${messageCheck.reason}`);

  const user = (await db.collection('users').doc(uid).get()).data() as Record<string, unknown> | undefined;
  const userName = enforceLimit(sanitizeText(user?.userName || 'Member'), LIMITS.userName);
  const userEmail = sanitizeEmail(user?.email || token.email || '');

  await db.collection('profileMessages').add({
    userId: uid,
    userName,
    userEmail,
    topic,
    topicLabel,
    message,
    status: 'new',
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});
