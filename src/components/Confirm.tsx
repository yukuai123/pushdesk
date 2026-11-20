import { Disclosure, Input, Button } from '../ui';
import { platformNames } from '../platform';
import { ArrowUpRight } from 'lucide-react';
import { useState } from 'react';
import { statuses, type Task } from '../api';
import { size } from '../utils';
import { Badge } from './Badge';
import { Modal } from './Modal';

export function Confirm({
  task: t,
  busy,
  close,
  onPublish,
  onReconcile,
  onDiscard,
}: {
  task: Task;
  busy: boolean;
  close: () => void;
  onPublish: (x: string) => void;
  onReconcile: () => void;
  onDiscard: () => void;
}) {
  const [name, setName] = useState('');
  return (
    <Modal title={t.status === 'ready' ? '确认发布热更新' : '发布任务详情'} close={close}>
      <div className="modal-body">
        <div className={'confirm-banner ' + t.rule.lane}>
          <Badge lane={t.rule.lane} />
          <h2>
            {t.projectName} <code>{t.rule.target}</code>
          </h2>
          <p>
            {t.rule.branch} → {t.app} / {t.rule.deployment}
          </p>
        </div>
        <dl>
          <dt>状态</dt>
          <dd>
            {statuses[t.status]} {t.label}
          </dd>
          <dt>发布平台</dt>
          <dd>{platformNames[t.platform || 'android']}</dd>
          <dt>来源提交</dt>
          <dd className="mono break">{t.commit || '尚未确定'}</dd>
          <dt>构建产物</dt>
          <dd>{size(t.size)}</dd>
          <dt>SHA256</dt>
          <dd className="mono break tiny">{t.sha256 || '尚未生成'}</dd>
          <dt>更新策略</dt>
          <dd>{t.mandatory ? '强制更新' : '非强制更新'} · 全量发布</dd>
          <dt>备注标签</dt>
          <dd>{t.rule.tag || '未填写'}</dd>
          <dt>更新说明</dt>
          <dd>{t.description || '未填写'}</dd>
        </dl>
        {t.artifact && (
          <pre className="command-preview">
            code-push release {JSON.stringify(t.app)} {JSON.stringify(t.artifact)} {t.rule.target}{' '}
            --deploymentName {t.rule.deployment} --mandatory {String(t.mandatory)} --description{' '}
            {JSON.stringify(t.description + `\n[PushDesk:${t.id}]`)}
          </pre>
        )}
        {t.error && <p className="danger break">{t.error}</p>}
        {(t.logs?.length ?? 0) > 0 && (
          <Disclosure>
            <summary>查看该任务的执行日志</summary>
            <pre className="command-preview">{t.logs?.map((l) => l.text).join('\n')}</pre>
          </Disclosure>
        )}
        {t.status === 'ready' && (
          <label>
            输入项目名称「{t.projectName}」确认
            <Input
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.projectName}
            />
          </label>
        )}
        {t.status === 'unknown' && (
          <div className="notice">发布可能已到达服务端。请先回查结果，避免重复上传。</div>
        )}
      </div>
      <div className="modal-footer">
        {['ready', 'failed', 'outdated'].includes(t.status) && (
          <Button disabled={busy} onClick={onDiscard}>
            放弃任务
          </Button>
        )}
        <span className="grow" />
        <Button onClick={close}>关闭</Button>
        {t.status === 'unknown' && (
          <Button className="primary" disabled={busy} onClick={onReconcile}>
            回查结果
          </Button>
        )}
        {t.status === 'ready' && (
          <Button
            className="primary"
            disabled={busy || name !== t.projectName}
            onClick={() => onPublish(name)}
          >
            <ArrowUpRight size={15} />
            确认发布
          </Button>
        )}
      </div>
    </Modal>
  );
}
