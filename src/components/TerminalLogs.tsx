import { Collapse, Spin } from 'antd';
import { useEffect, useRef, useState } from 'react';
import type { Log } from '../api';
import { terminalEntries, type BuildLogGroup } from '../logs';

function LogLine({ log }: { log: Log }) {
  return (
    <div className={'log ' + log.kind}>
      <time>{new Date(log.time).toLocaleTimeString('zh-CN', { hour12: false })}</time>
      <pre>{log.text}</pre>
    </div>
  );
}
function BuildDetails({ group }: { group: BuildLogGroup }) {
  const { latest } = group;
  const status = latest.stage?.status || 'running';
  const [expanded, setExpanded] = useState(status === 'error');
  useEffect(() => {
    if (status === 'error') setExpanded(true);
  }, [status]);
  return (
    <Collapse
      className="build-log-group"
      size="small"
      activeKey={expanded ? ['details'] : []}
      onChange={(keys) => setExpanded(keys.includes('details'))}
      destroyOnHidden
      items={[
        {
          key: 'details',
          label: (
            <span className={'build-log-summary ' + status}>
              {status === 'running' && <Spin size="small" />}
              <span>
                {latest.stage ? latest.text : `${group.first.groupTitle || '构建输出'} · 进行中`}
              </span>
              <small>详细日志（{group.details.length} 条）</small>
            </span>
          ),
          children: group.details.length ? (
            group.details.map((log) => <LogLine key={log.id} log={log} />)
          ) : (
            <span className="muted tiny">等待构建输出…</span>
          ),
        },
      ]}
    />
  );
}
export function TerminalLogs({ logs }: { logs: Log[] }) {
  const entries = terminalEntries(logs);
  const end = useRef<HTMLDivElement>(null);
  // Folded build output must not repeatedly pull the page to the bottom.
  const visibleChanges = entries
    .map(({ log, group }) => (group ? group.id + ':' + group.latest.stage?.status : log.id))
    .join('|');
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [visibleChanges]);
  return (
    <>
      {entries.map(({ log, group }) =>
        group ? <BuildDetails key={group.id} group={group} /> : <LogLine key={log.id} log={log} />,
      )}
      <div ref={end} />
    </>
  );
}
