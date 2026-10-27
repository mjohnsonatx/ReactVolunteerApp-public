import { describe, expect, it } from 'vitest';
import {
  adminLogTimestampMillis,
  adminLogsCsvFileName,
  buildAdminLogsCsv,
  countOpenEventReports,
  normalizeAdminLog,
  normalizeAdminLogs,
  clientErrorTags,
} from '../../../shared/src/adminLogs';

describe('administrator log normalization and export', () => {
  it.each([
    ['handleNewPost', 'forum-post'], ['handleReply', 'forum-post'],
    ['AccountSettings-saveProfile', 'account-profile'], ['ProfileSetup-saveProfile', 'account-profile'],
  ])('classifies both new and legacy %s errors as %s', (context, category) => {
    expect(clientErrorTags(context)).toContain(category);
    expect(normalizeAdminLog('errorLogs', 'legacy', { context, tags: ['error'] }).tags).toContain(category);
  });
  it('normalizes current audit entries with actor, action, and resource tags', () => {
    const log = normalizeAdminLog('adminAuditLogs', 'a1', {
      type: 'admin-action',
      action: 'forum-post.delete',
      summary: 'Deleted forum post',
      actorUid: 'admin-1',
      actorEmail: 'admin@example.test',
      resourceType: 'forum-post',
      resourceId: 'post-1',
      surface: 'desktop',
      tags: ['admin-action', 'delete'],
      createdAt: { seconds: 1_800_000_000, nanoseconds: 500_000_000 },
    });

    expect(log).toMatchObject({
      id: 'adminAuditLogs:a1',
      type: 'admin-action',
      action: 'forum-post.delete',
      actorEmail: 'admin@example.test',
      resourceType: 'forum-post',
      timestampMs: 1_800_000_000_500,
    });
    expect(log.tags).toEqual(expect.arrayContaining(['admin-action', 'forum-post', 'action:forum-post.delete', 'delete']));
  });

  it('keeps legacy error timestamps and infers useful tags', () => {
    const log = normalizeAdminLog('errorLogs', 'e1', {
      context: 'forum-post-submit',
      message: 'Could not post',
      uid: 'member-1',
      at: { toMillis: () => 1_700_000_000_000 },
    });

    expect(log.type).toBe('error');
    expect(log.actorUid).toBe('member-1');
    expect(log.timestampMs).toBe(1_700_000_000_000);
    expect(log.tags).toEqual(expect.arrayContaining(['error', 'forum-post-submit', 'forum-post']));
    expect(adminLogTimestampMillis({ toDate: () => new Date(1234) })).toBe(1234);
  });

  it('combines both collections newest-first', () => {
    const logs = normalizeAdminLogs(
      [{ id: 'a1', action: 'event.update', createdAt: 200 }],
      [{ id: 'e1', context: 'event-load', createdAt: 300 }],
    );
    expect(logs.map(log => log.id)).toEqual(['errorLogs:e1', 'adminAuditLogs:a1']);
  });

  it('does not keep the Events badge lit for reports whose event was deleted', () => {
    const events = [{ id: 'live-event' }];
    const reports = [
      { eventId: 'live-event', status: 'new' },
      { eventId: 'live-event', status: 'resolved' },
      { eventId: 'deleted-event', status: 'new' },
    ];
    expect(countOpenEventReports(events, reports)).toBe(1);
    expect(countOpenEventReports([], reports)).toBe(0);
  });

  it('formula-escapes every exported log field', () => {
    const log = normalizeAdminLog('adminAuditLogs', 'a1', {
      action: 'user.update',
      actorEmail: '=HYPERLINK("https://evil.example")',
      summary: '+danger',
      details: { note: '@formula' },
      createdAt: 1_700_000_000_000,
    });
    const csv = buildAdminLogsCsv([log]);
    expect(csv).toContain(`"'=HYPERLINK(""https://evil.example"")"`);
    expect(csv).toContain(`"'+danger"`);
    expect(csv).not.toMatch(/(^|\r\n)"?=/);
  });

  it('uses a timestamped, filesystem-safe export filename', () => {
    expect(adminLogsCsvFileName(new Date('2026-10-15T15:16:17.000Z')))
      .toBe('watershedcrew-admin-logs-2026-10-15T15-16-17Z.csv');
  });
});
