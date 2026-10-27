import type { CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './firebaseAdmin';
import { requireAdmin } from './guards';

type AuditDetail = string | number | boolean | null;

export type AdminAuditEvent = {
  action: string;
  summary: string;
  resourceType: string;
  resourceId?: string;
  tags?: string[];
  details?: Record<string, AuditDetail | undefined>;
};

function boundedText(value: unknown, maxLength: number): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
}

function auditTag(value: unknown): string {
  return boundedText(value, 40)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function detailKey(value: unknown): string {
  const key = boundedText(value, 40).replace(/[^A-Za-z0-9_.:-]+/g, '_');
  return key === '__proto__' || key === 'prototype' || key === 'constructor' ? '' : key;
}

function cleanDetails(details: AdminAuditEvent['details']): Record<string, AuditDetail> {
  const clean: Record<string, AuditDetail> = {};
  for (const [rawKey, rawValue] of Object.entries(details ?? {}).slice(0, 20)) {
    if (rawValue === undefined) continue;
    const key = detailKey(rawKey);
    if (!key) continue;
    clean[key] = typeof rawValue === 'string' ? boundedText(rawValue, 200) : rawValue;
  }
  return clean;
}

/**
 * Records a completed privileged operation. Identity is taken only from the
 * verified Auth token; callers cannot provide or spoof actor fields.
 *
 * The mutation itself is never retried merely because audit persistence had a
 * transient failure. Such failures go to Cloud Logging with the actor/action
 * so operators still have a recovery trail without risking duplicate deletes
 * or other non-idempotent admin work.
 */
export async function recordAdminAction(request: CallableRequest, event: AdminAuditEvent): Promise<void> {
  const { uid, token } = requireAdmin(request);
  const action = auditTag(event.action);
  const resourceType = auditTag(event.resourceType);
  const surface = token.desktop_admin_mfa === true ? 'desktop' : 'web';
  const tags = Array.from(new Set([
    'admin-action',
    `action:${action}`,
    resourceType,
    action.split('.').filter(Boolean).at(-1) || '',
    surface,
    ...(event.tags ?? []).map(auditTag),
  ].filter(Boolean))).slice(0, 12);

  try {
    await db.collection('adminAuditLogs').add({
      type: 'admin-action',
      action,
      summary: boundedText(event.summary, 200),
      resourceType,
      resourceId: boundedText(event.resourceId, 200),
      actorUid: uid,
      actorEmail: boundedText(token.email, 320),
      actorName: boundedText(token.name, 120),
      surface,
      tags,
      details: cleanDetails(event.details),
      status: 'succeeded',
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error('Failed to persist administrator audit log.', {
      action,
      actorUid: uid,
      resourceType,
      resourceId: boundedText(event.resourceId, 200),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
