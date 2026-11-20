const { assert, validateProject } = require('./core.cjs');

const recordKey = (rule) => `${rule.deployment}:${rule.target}`;
const releaseFields = ['id', 'lane', 'branch', 'deployment', 'target', 'envFile'];
function sameReleaseRule(current, snapshot) {
  return !!current && releaseFields.every((field) => current[field] === snapshot[field]);
}
function rememberVersions(previous, project) {
  const records = new Map(
    (previous?.versionRecords || []).map((record) => [recordKey(record), record]),
  );
  for (const rule of [...(previous?.rules || []), ...project.rules]) {
    records.set(recordKey(rule), {
      target: rule.target,
      deployment: rule.deployment,
      lane: rule.lane,
      tag: rule.tag || '',
      branch: rule.branch,
    });
  }
  return { ...project, versionRecords: [...records.values()] };
}
function updateVersion(project, input) {
  const current = project.rules.find((rule) => rule.id === input.ruleId);
  assert(current, '发布版本配置不存在，请刷新后重试');
  assert(current.target === input.expectedTarget, '版本已被修改，请刷新后重试');
  assert(typeof input.target === 'string', '请输入版本号');
  assert(typeof input.tag === 'string' && input.tag.trim().length <= 80, '备注标签最多 80 个字符');
  const rule = { ...current, target: input.target.trim(), tag: input.tag.trim() };
  const next = {
    ...project,
    rules: project.rules.map((item) => (item.id === rule.id ? rule : item)),
  };
  validateProject(next);
  return rememberVersions(project, next);
}
function invalidateVersionTasks(tasks, projectId, previous, next) {
  const changed = new Set(
    next.rules
      .filter((rule) => {
        const old = previous.rules.find((item) => item.id === rule.id);
        return old && !sameReleaseRule(rule, old);
      })
      .map((rule) => rule.id),
  );
  return tasks
    .filter(
      (task) =>
        task.projectId === projectId && task.status === 'ready' && changed.has(task.rule.id),
    )
    .map((task) => ({
      ...task,
      status: 'outdated',
      error: '发布版本或配置已变更，请按新版本重新构建；旧产物不会继续发布。',
    }));
}
module.exports = { rememberVersions, updateVersion, invalidateVersionTasks, sameReleaseRule };
