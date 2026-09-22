import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export function fmtBytes(n?: number | null): string {
  if (n == null || isNaN(n)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function fmtNum(n?: number | null): string {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US');
}

export function fmtDate(v?: string | number | null): string {
  if (v == null || v === '') return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
}

export function fmtRelative(v?: string | number | null): string {
  if (v == null || v === '') return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const s = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(s);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 60) return rtf.format(s, 'second');
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}
