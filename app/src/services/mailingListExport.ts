import { callableErrorMessage, exportMailingListCsvFn } from '../libs/callables';
import { recordCrash } from '../utils/crashReporting';

export type MailingListExportResult = {
  filename: string;
  count: number;
  generatedAt: string;
  truncated?: boolean;
};

// The CSV itself is generated (and formula-escaped) on the server; the browser
// only turns the returned text into a download.
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === 'undefined') return;
  // The UTF-8 BOM keeps Excel from mangling non-ASCII names.
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportMailingListCsv(): Promise<MailingListExportResult> {
  try {
    const response = await exportMailingListCsvFn({});
    const data = response.data as MailingListExportResult & { csv: string };
    if (!data?.csv) throw new Error('The export came back empty.');
    downloadCsv(data.filename, data.csv);
    return {
      filename: data.filename,
      count: data.count,
      generatedAt: data.generatedAt,
      truncated: data.truncated,
    };
  } catch (err) {
    recordCrash(err, 'mailingList-export');
    throw new Error(callableErrorMessage(err, 'Could not export the mailing list. Please try again.'));
  }
}
