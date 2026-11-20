import type { Log } from './api';

export type BuildLogGroup = {
  id: string;
  first: Log;
  latest: Log;
  details: Log[];
};
export type TerminalEntry = { log: Log; group?: BuildLogGroup };

export function terminalEntries(logs: Log[]): TerminalEntry[] {
  const groups = new Map<string, BuildLogGroup>();
  for (const log of logs) {
    if (!log.groupId || log.kind === 'command') continue;
    let group = groups.get(log.groupId);
    if (!group) {
      group = { id: log.groupId, first: log, latest: log, details: [] };
      groups.set(log.groupId, group);
    }
    if (log.stage) group.latest = log;
    else group.details.push(log);
  }
  return logs.flatMap((log) => {
    const group = log.groupId && groups.get(log.groupId);
    if (!group || log.kind === 'command') return [{ log }];
    return group.first === log ? [{ log, group }] : [];
  });
}

// Evict verbose build details first so long builds keep commands and stage boundaries visible.
export function retainLogs(logs: Log[], limit = 500): Log[] {
  let remove = Math.max(0, logs.length - limit);
  return logs
    .filter((log) => {
      if (remove && log.groupId && !log.stage && log.kind === 'output') {
        remove -= 1;
        return false;
      }
      return true;
    })
    .slice(-limit);
}
