import { describe, expect, it } from 'vitest';
import {
  buildCsv,
  buildMailingListCsv,
  csvCell,
  escapeCsvField,
  isCsvInjectionRisk,
  mailingListCsvFileName,
} from '../../src/utils/sanitize';

describe('CSV formula injection defenses', () => {
  it('flags every spreadsheet formula trigger', () => {
    for (const payload of ['=1+1', '+1', '-1', '@SUM(A1)', '\tcmd', '\rcmd', '\ncmd']) {
      expect(isCsvInjectionRisk(payload)).toBe(true);
    }
    expect(isCsvInjectionRisk('neighbor@example.com')).toBe(false);
    expect(isCsvInjectionRisk('')).toBe(false);
    expect(isCsvInjectionRisk(null)).toBe(false);
  });

  it('neutralizes formulas by prefixing an apostrophe', () => {
    expect(escapeCsvField('=HYPERLINK("http://evil.example","click")'))
      .toBe(`'=HYPERLINK("http://evil.example","click")`);
    expect(escapeCsvField('=cmd|\' /C calc\'!A0')).toBe(`'=cmd|' /C calc'!A0`);
    expect(escapeCsvField('+1-555-0100')).toBe(`'+1-555-0100`);
    expect(escapeCsvField('-2')).toBe(`'-2`);
    expect(escapeCsvField('@example')).toBe(`'@example`);
  });

  it('leaves ordinary values untouched', () => {
    expect(escapeCsvField('neighbor@example.com')).toBe('neighbor@example.com');
    expect(escapeCsvField('2026-07-10T00:00:00.000Z')).toBe('2026-07-10T00:00:00.000Z');
    expect(escapeCsvField(undefined)).toBe('');
    expect(escapeCsvField(null)).toBe('');
  });

  it('strips control characters that break CSV parsers', () => {
    expect(escapeCsvField('a\u0000b\u0007c')).toBe('abc');
    expect(escapeCsvField('line\r\nbreak')).toBe('line\nbreak');
  });

  it('quotes cells and escapes embedded quotes', () => {
    expect(csvCell('plain')).toBe('"plain"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=1+1')).toBe(`"'=1+1"`);
    // A quoted formula must not be able to break out of the cell.
    expect(csvCell('=1+1","=2+2')).toBe(`"'=1+1"",""=2+2"`);
  });

  it('builds a CSV with a header row and CRLF line endings', () => {
    const csv = buildCsv(['A', 'B'], [['1', '2'], ['3', '4']]);
    expect(csv).toBe('"A","B"\r\n"1","2"\r\n"3","4"');
  });

  it('escapes every mailing list column', () => {
    const csv = buildMailingListCsv([
      { email: '=cmd|\' /C calc\'!A0', subscribedAt: '2026-07-10T12:00:00.000Z', status: 'subscribed' },
      { email: 'neighbor@example.com', subscribedAt: '', status: '@unsubscribed' },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('"Email","Subscription Date","Status"');
    expect(lines[1]).toBe(`"'=cmd|' /C calc'!A0","2026-07-10T12:00:00.000Z","subscribed"`);
    expect(lines[2]).toBe(`"neighbor@example.com","","'@unsubscribed"`);
    expect(csv).not.toMatch(/(^|\n)"?=/);
  });

  it('uses a predictable, repeatable file name', () => {
    const date = new Date('2026-07-10T18:22:00.000Z');
    expect(mailingListCsvFileName(date)).toBe('watershedcrew-mailing-list-2026-07-10.csv');
    expect(mailingListCsvFileName(date)).toBe(mailingListCsvFileName(date));
    expect(mailingListCsvFileName(date, 'Weird Prefix!!')).toBe('weird-prefix-2026-07-10.csv');
  });
});
