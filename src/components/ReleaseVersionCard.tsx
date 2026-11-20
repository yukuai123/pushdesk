import { sourceBranch } from '../versions';
import { Card } from 'antd';
import { Input, Button } from '../ui';
import { ArrowUpRight, Check, GitBranch, Pencil, X } from 'lucide-react';
import { useState } from 'react';
import {
  names,
  type Release,
  type Rule,
  type Platform,
  type Task,
  type VersionUpdate,
} from '../api';
import { matches } from '../utils';
import { Badge } from './Badge';

type Props = {
  projectId: string;
  platform?: Platform;
  tasks?: Task[];
  app?: string;
  rule: Rule;
  cache?: { items: Release[]; time: number } | null;
  busy: boolean;
  onSave: (input: VersionUpdate) => Promise<unknown>;
  onPublish: (ruleId: string) => void;
};
export function ReleaseVersionCard({
  projectId,
  rule,
  cache,
  busy,
  onSave,
  onPublish,
  platform = 'android',
  tasks = [],
  app,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState(rule.target);
  const [branch, setBranch] = useState(rule.branch);
  const [tag, setTag] = useState(rule.tag || '');
  const [error, setError] = useState('');
  const packages = (cache?.items || [])
    .filter(
      (item) => !item.isDisabled && item.rollout !== 0 && matches(rule.target, item.appVersion),
    )
    .sort((a, b) => b.uploadTime - a.uploadTime);
  const context = { projectId, platform, app, deployment: rule.deployment };
  const latest =
    packages.find((item) => sourceBranch(item, tasks, context) === rule.branch) ||
    packages.find((item) => !sourceBranch(item, tasks, context));
  const branchKnown = latest && sourceBranch(latest, tasks, context) === rule.branch;
  function edit() {
    setTarget(rule.target);
    setBranch(rule.branch);
    setTag(rule.tag || '');
    setError('');
    setEditing(true);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await onSave({
        projectId,
        ruleId: rule.id,
        expectedTarget: rule.target,
        expectedBranch: rule.branch,
        target,
        branch,
        tag,
      });
      setEditing(false);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <Card styles={{ body: { padding: 0 } }} className={'lane-card ' + rule.lane}>
      <div className="lane-top">
        <Badge lane={rule.lane} />
        <span className="muted tiny">{rule.deployment}</span>
      </div>
      {editing ? (
        <form className="version-editor" onSubmit={save}>
          <label>
            包版本号
            <Input
              autoFocus
              required
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              placeholder="例如 1.0.6"
            />
          </label>
          <label>
            来源分支
            <Input
              required
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              placeholder="例如 releaseGray"
            />
          </label>
          <label>
            备注标签
            <Input
              maxLength={80}
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              placeholder="例如：灰度验收 / 门店试用"
            />
          </label>
          <div className="version-editor-actions">
            <Button type="button" disabled={busy} onClick={() => setEditing(false)}>
              <X size={13} />
              取消
            </Button>
            <Button className="primary" disabled={busy}>
              <Check size={13} />
              保存并同步
            </Button>
          </div>
          {error && (
            <p role="alert" className="danger tiny">
              {error}
            </p>
          )}
        </form>
      ) : (
        <>
          <div className="version-card-heading">
            <div className="target-version">
              {rule.target}
              <span>包版本号</span>
            </div>
            <Button
              className="text-button"
              disabled={busy}
              onClick={edit}
              aria-label={`修改 ${rule.target} + ${rule.branch} 的版本、分支和标签`}
            >
              <Pencil size={14} />
              修改
            </Button>
          </div>
          {rule.tag ? (
            <span className="version-tag">{rule.tag}</span>
          ) : (
            <Button className="text-button version-tag-empty" disabled={busy} onClick={edit}>
              + 添加备注标签
            </Button>
          )}
        </>
      )}
      <div className="lane-details">
        <span>
          <GitBranch size={14} />
          <code>{rule.branch}</code>
        </span>
        <span className="release-label">{latest?.label || '—'}</span>
      </div>
      <div className="card-footer">
        <span>
          {!cache
            ? '尚未查询'
            : latest
              ? branchKnown
                ? latest === packages[0]
                  ? '该分支当前匹配更新'
                  : '该分支最近发布，非包当前更新'
                : '包版本匹配，分支未记录'
              : '该分支暂无发布记录'}
        </span>
        <Button
          disabled={busy || editing}
          aria-label={`发布 ${rule.target} + ${rule.branch} ${names[rule.lane]}`}
          onClick={() => onPublish(rule.id)}
        >
          发布
          <ArrowUpRight size={15} />
        </Button>
      </div>
    </Card>
  );
}
