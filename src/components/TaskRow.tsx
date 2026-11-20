import { Button } from '../ui';
import { platformNames } from '../platform';
import { Box, Check, ChevronRight } from 'lucide-react';
import { statuses, type Task } from '../api';
import { date } from '../utils';
import { Badge } from './Badge';

export function TaskRow({ t, onOpen }: { t: Task; onOpen: () => void }) {
  return (
    <Button className="task-row" onClick={onOpen}>
      <span className={'task-symbol ' + t.status}>
        {t.status === 'confirmed' ? <Check size={18} /> : <Box size={18} />}
      </span>
      <div className="grow">
        <strong>
          {t.projectName} · {platformNames[t.platform || 'android']}
          <span className="mono">
            {t.rule.target} · {t.rule.branch}
          </span>
        </strong>
        <small>
          {t.description || '未填写更新说明'} · {date(t.createdAt)}
        </small>
      </div>
      <Badge lane={t.rule.lane} />
      <span className={'status ' + (t.status === 'confirmed' ? 'ok' : '')}>
        {statuses[t.status]}
      </span>
      <ChevronRight size={16} />
    </Button>
  );
}
