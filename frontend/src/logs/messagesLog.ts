import { brokerFetch } from '../api/broker';

// messages.log and rotated messages.old_* files, read through the broker
// (IrisOps.MessagesLog). Implements Community Idea DPI-I-966.

export interface MessagesLogFile {
  name: string;
  size: number;
  modified: string;
  current: boolean;
}

export interface MessagesLogContent {
  name: string;
  totalLines: number;
  truncated: boolean;
  lines: string[];
}

// IRIS serializes these flags as 1/0.
type Wire<T> = { [K in keyof T]: T[K] extends boolean ? boolean | number : T[K] };

export async function listMessagesLogs(): Promise<MessagesLogFile[]> {
  const { files } = await brokerFetch<{ files: Wire<MessagesLogFile>[] }>('/api/logs/messages');
  return files.map((f) => ({ ...f, current: Boolean(f.current) }));
}

export async function readMessagesLog(name: string, lines: number): Promise<MessagesLogContent> {
  const c = await brokerFetch<Wire<MessagesLogContent>>(`/api/logs/messages/${encodeURIComponent(name)}?lines=${lines}`);
  return { ...c, truncated: Boolean(c.truncated) };
}
