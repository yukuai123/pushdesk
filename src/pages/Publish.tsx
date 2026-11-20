import { requiresConfirmation } from '../release-policy';
import { Checkbox, Select, Textarea, Disclosure, Button } from '../ui';
import { releaseCommand } from '../versions';
import { appName, platformNames } from '../platform';
import { GitBranch, Play, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { names, type Platform, type PrepareInput, type Project } from '../api';
import { Badge } from '../components/Badge';

export function Publish({
  project: project,
  busy,
  platform = 'android',
  initialRuleId = '',
  onPrepare,
}: {
  project: Project;
  platform?: Platform;
  initialRuleId?: string;
  busy: boolean;
  onPrepare: (input: PrepareInput) => void;
}) {
  const [ruleId, setRuleId] = useState(initialRuleId),
    [description, setDescription] = useState(''),
    [mandatory, setMandatory] = useState(true);
  const rule = project.rules.find((rule) => rule.id === ruleId) || project.rules[0];
  return (
    <form
      className="panel publish-panel"
      onSubmit={(e) => {
        e.preventDefault();
        onPrepare({ projectId: project.id, ruleId: rule.id, description, mandatory, platform });
      }}
    >
      <div className="panel-heading">
        <h2>准备 {platformNames[platform]} 发布</h2>
        <span className="badge neutral">
          <ShieldCheck size={13} />
          {requiresConfirmation(rule) ? '构建完成后再次确认' : '构建完成后直接发布'}
        </span>
      </div>
      <div className="publish-body">
        <label>
          发布配置
          <Select value={rule.id} onChange={(e) => setRuleId(e.target.value)}>
            {project.rules.map((rule) => (
              <option key={rule.id} value={rule.id}>
                {rule.target}
                {rule.tag ? ` · ${rule.tag}` : ''} · {names[rule.lane]}
              </option>
            ))}
          </Select>
        </label>
        <div className={'release-summary ' + rule.lane}>
          <Badge lane={rule.lane} />
          <strong className="mono">{rule.target}</strong>
          {rule.tag && <span className="version-tag">{rule.tag}</span>}
          <span>
            <GitBranch size={15} />
            {rule.branch}
          </span>
          <span>
            → {appName(project, platform)} / {rule.deployment}
          </span>
          <small>{rule.envFile}</small>
        </div>
        <label className="publish-description">
          更新说明（选填）
          <Textarea
            placeholder="可填写本次更新内容，留空也可发布"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <Checkbox
          className="checkbox"
          checked={mandatory}
          onChange={(e) => setMandatory(e.target.checked)}
        >
          强制更新
        </Checkbox>
        <div className="notice">
          <ShieldCheck size={17} />
          <span>
            从远端绑定分支获取最新提交，在独立目录构建。
            {requiresConfirmation(rule) ? '确认后上传更新。' : '构建成功后自动上传更新。'}
          </span>
        </div>
        <Disclosure className="publish-command">
          <summary>查看发布命令 · 版本号随配置同步</summary>
          <pre className="command-preview">
            {releaseCommand(project, rule, platform, description, mandatory)}
          </pre>
        </Disclosure>
        <div className="form-footer">
          <span className="muted tiny">执行过程将在下方终端展示</span>
          <Button className="primary" disabled={busy}>
            <Play size={15} />
            {busy ? '正在执行…' : requiresConfirmation(rule) ? '检查并构建' : '构建并发布'}
          </Button>
        </div>
      </div>
    </form>
  );
}
