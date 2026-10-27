import { useMemo, useState } from 'react';
import { AlertTriangle, Download, RefreshCw, Search, ScrollText } from 'lucide-react';
import { normalizeAdminLogs, type AdminLogEntry } from '@watershed/shared';
import { useApp } from '@runtime/app-context';
import { exportAllAdminLogs, fetchAllAdminLogs } from '../../services/adminLogs';

function actorLabel(log: AdminLogEntry): string {
  return log.actorName || log.actorEmail || log.actorUid || (log.type === 'error' ? 'Anonymous visitor' : 'Unknown administrator');
}

function dateLabel(log: AdminLogEntry): string {
  return log.timestampMs ? new Date(log.timestampMs).toLocaleString() : 'Unknown time';
}

export default function AdminLogs() {
  const { adminAuditLogs = [], errorLogs = [] } = useApp();
  const recent = useMemo(() => normalizeAdminLogs(adminAuditLogs, errorLogs), [adminAuditLogs, errorLogs]);
  const [allLogs, setAllLogs] = useState<AdminLogEntry[] | null>(null);
  const [selectedTag, setSelectedTag] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<'load' | 'export' | ''>('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  // Loading history must not freeze out new live errors/actions.
  const logs = useMemo(() => {
    if (!allLogs) return recent;
    const merged = new Map(allLogs.map(log => [log.id, log]));
    recent.forEach(log => merged.set(log.id, log));
    return [...merged.values()].sort((a, b) => b.timestampMs - a.timestampMs || a.id.localeCompare(b.id));
  }, [allLogs, recent]);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    logs.forEach(log => log.tags.forEach(item => counts.set(item, (counts.get(item) || 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [logs]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return logs.filter(log => {
      if (selectedTag && !log.tags.includes(selectedTag)) return false;
      if (!needle) return true;
      return [
        log.action, log.summary, log.context, log.actorName, log.actorEmail, log.actorUid,
        log.resourceType, log.resourceId, log.tags.join(' '), log.stack, log.url,
      ].some(value => value.toLowerCase().includes(needle));
    });
  }, [logs, search, selectedTag]);

  const loadAll = async () => {
    setBusy('load'); setError(''); setNotice('');
    try {
      const loaded = await fetchAllAdminLogs();
      setAllLogs(loaded);
      setNotice(`Loaded all ${loaded.length.toLocaleString()} log entries.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load all logs.');
    } finally { setBusy(''); }
  };

  const exportAll = async () => {
    setBusy('export'); setError(''); setNotice('');
    try {
      const result = await exportAllAdminLogs();
      setNotice(`Downloaded ${result.count.toLocaleString()} entries as ${result.filename}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not export the logs.');
    } finally { setBusy(''); }
  };

  const shown = filtered.slice(0, 500);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900"><ScrollText size={24} />Activity logs</h2>
          <p className="mt-1 text-sm text-gray-600">Administrator actions identify the verified account that performed them. Client errors are kept alongside them for investigation.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={loadAll} disabled={!!busy}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <RefreshCw size={16} className={busy === 'load' ? 'animate-spin' : ''} />
            {allLogs ? 'Refresh all' : 'Load all'}
          </button>
          <button type="button" onClick={exportAll} disabled={!!busy}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50">
            <Download size={16} />{busy === 'export' ? 'Preparing CSV…' : 'Export all CSV'}
          </button>
        </div>
      </div>

      {(notice || error) && (
        <div role={error ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-teal-200 bg-teal-50 text-teal-800'}`}>
          {error || notice}
        </div>
      )}

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <label className="relative block">
          <Search size={17} className="pointer-events-none absolute left-3 top-2.5 text-gray-400" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search action, person, resource, message, or tag"
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100" />
        </label>
        <div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-auto" aria-label="Filter logs by tag">
          <button type="button" onClick={() => setSelectedTag('')}
            className={`rounded-full px-3 py-1 text-xs font-medium ${selectedTag === '' ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            All ({logs.length})
          </button>
          {tags.map(([item, count]) => (
            <button type="button" key={item} onClick={() => setSelectedTag(item)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${selectedTag === item ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              {item} ({count})
            </button>
          ))}
        </div>
        {(selectedTag || search) && <button type="button" onClick={() => { setSelectedTag(''); setSearch(''); }} className="mt-3 text-sm text-teal-700 underline">Clear filters</button>}
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="flex flex-wrap justify-between gap-2 border-b border-gray-200 px-5 py-3 text-sm text-gray-600">
          <span>{filtered.length.toLocaleString()} matching {allLogs ? 'all stored logs' : 'recent live logs'}</span>
          {filtered.length > shown.length && <span>Showing newest {shown.length.toLocaleString()}; use CSV for the complete result.</span>}
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-gray-500">No logs match this filter.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {shown.map(log => (
              <article key={log.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {log.type === 'error' && <AlertTriangle size={16} className="text-red-600" aria-label="Error" />}
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${log.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-teal-100 text-teal-800'}`}>
                        {log.action || log.context || log.type}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{log.summary || 'No summary recorded'}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-600">
                      {actorLabel(log)}
                      {log.actorEmail && log.actorName ? ` · ${log.actorEmail}` : ''}
                      {log.resourceType ? ` · ${log.resourceType}${log.resourceId ? ` ${log.resourceId}` : ''}` : ''}
                      {log.surface ? ` · ${log.surface}` : ''}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {log.tags.map(item => <span key={item} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{item}</span>)}
                    </div>
                  </div>
                  <time className="shrink-0 text-xs text-gray-500" dateTime={log.timestampIso || undefined}>{dateLabel(log)}</time>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
