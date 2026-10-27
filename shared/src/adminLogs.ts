import { buildCsv } from './csvSafe';

export type AdminLogSource = 'adminAuditLogs' | 'errorLogs';

export type AdminLogEntry = {
  id: string;
  source: AdminLogSource;
  type: 'admin-action' | 'error';
  action: string;
  summary: string;
  context: string;
  actorUid: string;
  actorEmail: string;
  actorName: string;
  surface: string;
  resourceType: string;
  resourceId: string;
  status: string;
  tags: string[];
  timestampMs: number;
  timestampIso: string;
  details: unknown;
  stack: string;
  url: string;
};

export function countOpenEventReports(
  events: readonly { id?: unknown }[],
  reports: readonly { eventId?: unknown; status?: unknown }[],
): number {
  const liveEventIds = new Set(events.map(event => text(event.id)).filter(Boolean));
  return reports.filter(report => report.status !== 'resolved' && liveEventIds.has(text(report.eventId))).length;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

export function adminLogTimestampMillis(value: any): number {
  if (typeof value?.toMillis === 'function') return Number(value.toMillis()) || 0;
  if (typeof value?.toDate === 'function') return value.toDate()?.getTime?.() || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return Number.isNaN(Date.parse(value)) ? 0 : Date.parse(value);
  if (typeof value?.seconds === 'number') return value.seconds * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1_000_000);
  return 0;
}

function tag(value: unknown): string {
  return text(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function inferredErrorTag(context: string): string {
  if (['handlenewpost', 'handlereply', 'handlevote', 'submitreport'].includes(context)) return 'forum-post';
  if (context.includes('profile') || context.startsWith('accountsettings')) return 'account-profile';
  const categories = [
    ['forum', 'forum-post'],
    ['event', 'event'],
    ['poll', 'poll'],
    ['document', 'document'],
    ['overlay', 'overlay'],
    ['auth', 'authentication'],
    ['mail', 'mailing-list'],
    ['volunteer', 'volunteer'],
  ] as const;
  return categories.find(([needle]) => context.includes(needle))?.[1] || '';
}

export function clientErrorTags(context: string): string[] {
  const normalized = tag(context);
  return Array.from(new Set(['error', normalized, inferredErrorTag(normalized)].filter(Boolean)));
}

function json(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); }
  catch { return '[unserializable]'; }
}

export function normalizeAdminLog(source: AdminLogSource, id: string, data: Record<string, any>): AdminLogEntry {
  const type = source === 'errorLogs' || data.type === 'error' ? 'error' : 'admin-action';
  const action = tag(data.action);
  const context = tag(data.context);
  const resourceType = tag(data.resourceType);
  const timestampMs = adminLogTimestampMillis(data.createdAt ?? data.at);
  const explicitTags = Array.isArray(data.tags) ? data.tags.map(tag) : [];
  const tags = Array.from(new Set([
    type,
    ...(type === 'error' ? clientErrorTags(context) : [resourceType]),
    type === 'admin-action' && action ? `action:${action}` : '',
    ...explicitTags,
  ].filter(Boolean)));

  return {
    id: `${source}:${id}`,
    source,
    type,
    action,
    summary: text(data.summary || data.message),
    context,
    actorUid: text(data.actorUid ?? data.uid),
    actorEmail: text(data.actorEmail),
    actorName: text(data.actorName),
    surface: tag(data.surface),
    resourceType,
    resourceId: text(data.resourceId),
    status: tag(data.status || (type === 'error' ? 'recorded' : 'succeeded')),
    tags,
    timestampMs,
    timestampIso: timestampMs ? new Date(timestampMs).toISOString() : '',
    details: data.details ?? data.extra ?? '',
    stack: text(data.stack),
    url: text(data.url),
  };
}

export function normalizeAdminLogs(
  adminActions: readonly Record<string, any>[],
  errors: readonly Record<string, any>[],
): AdminLogEntry[] {
  return [
    ...adminActions.map(item => normalizeAdminLog('adminAuditLogs', text(item.id), item)),
    ...errors.map(item => normalizeAdminLog('errorLogs', text(item.id), item)),
  ].sort((a, b) => b.timestampMs - a.timestampMs || a.id.localeCompare(b.id));
}

export const ADMIN_LOG_CSV_HEADERS = [
  'Timestamp', 'Type', 'Tags', 'Actor Name', 'Actor Email', 'Actor UID', 'Surface',
  'Action', 'Summary', 'Context', 'Resource Type', 'Resource ID', 'Status',
  'Details', 'Stack', 'URL',
] as const;

export function buildAdminLogsCsv(logs: readonly AdminLogEntry[]): string {
  return buildCsv(ADMIN_LOG_CSV_HEADERS, logs.map(log => [
    log.timestampIso,
    log.type,
    log.tags.join(' | '),
    log.actorName,
    log.actorEmail,
    log.actorUid,
    log.surface,
    log.action,
    log.summary,
    log.context,
    log.resourceType,
    log.resourceId,
    log.status,
    json(log.details),
    log.stack,
    log.url,
  ]));
}

export function adminLogsCsvFileName(date: Date = new Date()): string {
  const stamp = Number.isNaN(date.getTime()) ? new Date() : date;
  return `watershedcrew-admin-logs-${stamp.toISOString().replace(/[:.]/g, '-').slice(0, 19)}Z.csv`;
}
