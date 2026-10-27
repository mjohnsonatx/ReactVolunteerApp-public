import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import {
  adminLogsCsvFileName,
  buildAdminLogsCsv,
  normalizeAdminLogs,
  type AdminLogEntry,
  type AdminLogSource,
} from '@watershed/shared';
import { db } from '@runtime/firebase';
import { downloadCsv } from './mailingListExport';
import { recordAdminLogsExportFn } from '../libs/callables';

const PAGE_SIZE = 500;

async function fetchCollection(source: AdminLogSource): Promise<Array<Record<string, any>>> {
  const rows: Array<Record<string, any>> = [];
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null;

  while (true) {
    const pageQuery = cursor
      ? query(collection(db, source), orderBy(documentId()), startAfter(cursor), limit(PAGE_SIZE))
      : query(collection(db, source), orderBy(documentId()), limit(PAGE_SIZE));
    const page = await getDocs(pageQuery);
    rows.push(...page.docs.map(item => ({ id: item.id, ...item.data() })));
    if (page.size < PAGE_SIZE) break;
    cursor = page.docs.at(-1) ?? null;
    if (!cursor) break;
  }

  return rows;
}

export async function fetchAllAdminLogs(): Promise<AdminLogEntry[]> {
  const [actions, errors] = await Promise.all([
    fetchCollection('adminAuditLogs'),
    fetchCollection('errorLogs'),
  ]);
  return normalizeAdminLogs(actions, errors);
}

export async function exportAllAdminLogs(): Promise<{ count: number; filename: string }> {
  await recordAdminLogsExportFn({});
  const logs = await fetchAllAdminLogs();
  const filename = adminLogsCsvFileName();
  downloadCsv(filename, buildAdminLogsCsv(logs));
  return { count: logs.length, filename };
}
