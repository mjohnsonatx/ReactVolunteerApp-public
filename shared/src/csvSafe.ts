// CSV export helpers with spreadsheet formula-injection defenses.
//
// Excel / Google Sheets / LibreOffice evaluate any cell that starts with
// `=`, `+`, `-`, `@`, or a control character such as TAB / CR, which turns an
// innocent-looking subscriber address into a data-exfiltration payload
// (e.g. `=HYPERLINK("http://evil","click")`). Every exported field therefore
// runs through `escapeCsvField` before it is quoted.

const FORMULA_TRIGGERS = ['=', '+', '-', '@'];
// TAB, LF, CR are also treated as formula triggers by spreadsheet software.
const CONTROL_TRIGGERS = ['\t', '\r', '\n'];

export function isCsvInjectionRisk(value: unknown): boolean {
  if (typeof value !== 'string' || !value) return false;
  const first = value[0];
  return FORMULA_TRIGGERS.includes(first) || CONTROL_TRIGGERS.includes(first);
}

// Neutralizes formula triggers and strips characters that break CSV parsers.
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // Drop NUL and other C0 control characters except the ones we normalize below.
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
  text = text.replace(/\r\n?/g, '\n');
  // A leading trigger becomes a literal by prefixing an apostrophe, the
  // convention spreadsheet apps use for "this is text, do not evaluate".
  if (isCsvInjectionRisk(text)) text = `'${text}`;
  return text;
}

export function csvCell(value: unknown): string {
  const escaped = escapeCsvField(value);
  return `"${escaped.replace(/"/g, '""')}"`;
}

export function buildCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  // CRLF keeps Excel happy; the BOM is added by the download helper.
  return lines.join('\r\n');
}

export type MailingListExportRow = {
  email: string;
  subscribedAt: string;
  status: string;
};

export const MAILING_LIST_CSV_HEADERS = ['Email', 'Subscription Date', 'Status'] as const;

export function buildMailingListCsv(rows: readonly MailingListExportRow[]): string {
  return buildCsv(
    MAILING_LIST_CSV_HEADERS,
    rows.map(row => [row.email, row.subscribedAt, row.status]),
  );
}

// Predictable, repeatable, sortable file names:
// watershedcrew-mailing-list-YYYY-MM-DD.csv
export function mailingListCsvFileName(date: Date = new Date(), prefix = 'watershedcrew-mailing-list'): string {
  const safePrefix = prefix
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'mailing-list';
  const stamp = Number.isNaN(date.getTime()) ? new Date() : date;
  const iso = stamp.toISOString().slice(0, 10);
  return `${safePrefix}-${iso}.csv`;
}
