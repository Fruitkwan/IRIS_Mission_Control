// Parsing for IRIS messages.log lines:
//   MM/DD/YY-HH:MM:SS:mmm (pid) severity [source] text
// severity 0 = information, 1 = warning, 2 = severe error, 3 = fatal error.

export type LogSeverity = 'info' | 'warning' | 'severe' | 'fatal';

export interface LogEntry {
  time?: string;
  pid?: string;
  severity: LogSeverity;
  source?: string;
  text: string;
}

const LINE = /^(\d{2}\/\d{2}\/\d{2}-\d{2}:\d{2}:\d{2}:\d{3}) \((\d+)\) ([0-3]) \[([^\]]*)\] ?(.*)$/;
const SEVERITY: LogSeverity[] = ['info', 'warning', 'severe', 'fatal'];

export const severityRank = (s: LogSeverity) => SEVERITY.indexOf(s);

/** Parses lines in file order. Lines that do not start a new entry continue the previous one. */
export function parseLines(lines: string[]): LogEntry[] {
  const entries: LogEntry[] = [];
  for (const line of lines) {
    const m = LINE.exec(line);
    if (m) {
      entries.push({ time: m[1], pid: m[2], severity: SEVERITY[Number(m[3])], source: m[4], text: m[5] });
    } else if (entries.length) {
      entries[entries.length - 1].text += `\n${line}`;
    } else if (line.trim()) {
      entries.push({ severity: 'info', text: line });
    }
  }
  return entries;
}

/** Keeps entries at or above a severity that contain the query (case-insensitive) in text or source. */
export function filterEntries(entries: LogEntry[], minSeverity: LogSeverity, query: string) {
  const q = query.trim().toLowerCase();
  const min = severityRank(minSeverity);
  return entries.filter((e) => severityRank(e.severity) >= min &&
    (!q || e.text.toLowerCase().includes(q) || (e.source ?? '').toLowerCase().includes(q)));
}
