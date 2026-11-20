const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  updateVersion,
  invalidateVersionTasks,
  sameReleaseRule,
} = require('../electron/versions.cjs');
const {
  requiresConfirmation,
  checkPublishConfirmation,
  quickRules,
} = require('../electron/release-policy.cjs');
const project = () => ({
  id: 'p',
  name: 'PDA',
  path: '/tmp/pda',
  app: 'pda-android',
  rules: [
    {
      id: 'stable',
      lane: 'stable',
      branch: 'master',
      deployment: 'Production',
      target: '1.0.2',
      envFile: '.env.production',
      tag: '正式旧包',
    },
    {
      id: 'gray',
      lane: 'gray',
      branch: 'gray',
      deployment: 'Production',
      target: '1.0.3',
      envFile: '.env.production',
      tag: '灰度',
    },
  ],
});
test('快捷修改版本同步配置，保留旧版本标记，且不改写原项目', () => {
  const old = project();
  const next = updateVersion(old, {
    ruleId: 'stable',
    expectedTarget: '1.0.2',
    target: '1.0.4',
    tag: '新正式',
  });
  assert.equal(next.rules[0].target, '1.0.4');
  assert.equal(old.rules[0].target, '1.0.2');
  assert.equal(next.versionRecords.find((record) => record.target === '1.0.2').tag, '正式旧包');
  assert.equal(next.versionRecords.find((record) => record.target === '1.0.4').tag, '新正式');
  assert.equal(next.rules[0].branch, 'master');
});
test('重复、过期和不完整版本不能保存', () => {
  for (const target of ['1.0', '*'])
    assert.throws(() =>
      updateVersion(project(), { ruleId: 'stable', expectedTarget: '1.0.2', target, tag: '' }),
    );
  assert.throws(
    () =>
      updateVersion(project(), {
        ruleId: 'stable',
        expectedTarget: '1.0.1',
        target: '1.0.4',
        tag: '',
      }),
    /已被修改/,
  );
});
test('改版本号作废双端待发布产物，改标签不作废，历史结果不变', () => {
  const old = project();
  const tasks = ['android', 'ios'].map((platform) => ({
    id: platform,
    platform,
    projectId: 'p',
    rule: { ...old.rules[0] },
    status: 'ready',
  }));
  tasks.push({ ...tasks[0], id: 'confirmed', status: 'confirmed' });
  const next = updateVersion(old, {
    ruleId: 'stable',
    expectedTarget: '1.0.2',
    target: '1.0.4',
    tag: '新正式',
  });
  const changed = invalidateVersionTasks(tasks, 'p', old, next);
  assert.equal(changed.length, 2);
  assert.ok(changed.every((task) => task.status === 'outdated' && task.rule.target === '1.0.2'));
  assert.equal(tasks[2].status, 'confirmed');
  const tags = updateVersion(old, {
    ruleId: 'stable',
    expectedTarget: '1.0.2',
    target: '1.0.2',
    tag: '重命名',
  });
  assert.equal(invalidateVersionTasks(tasks, 'p', old, tags).length, 0);
  assert.equal(sameReleaseRule(tags.rules[0], old.rules[0]), true);
});
test('生产、灰度及 Production 目标无法通过自动模式绕过确认', () => {
  for (const rule of [
    ...project().rules,
    { lane: 'test', branch: 'test', deployment: 'Production', confirm: false },
    { lane: 'test', branch: 'master', deployment: 'Deployment', confirm: false },
  ]) {
    assert.equal(requiresConfirmation(rule), true);
    assert.throws(
      () => checkPublishConfirmation({ projectName: 'PDA', rule }, rule, { automatic: true }),
      /必须二次确认/,
    );
    assert.doesNotThrow(() =>
      checkPublishConfirmation({ projectName: 'PDA', rule }, rule, { confirmation: 'PDA' }),
    );
  }
});
test('测试/预发布默认直发，开启确认后生效，托盘不包含生产/灰度', () => {
  const testRule = { id: 'test', lane: 'test', branch: 'test', deployment: 'Deployment' };
  const stageRule = { id: 'release', lane: 'staging', branch: 'release', deployment: 'Staging' };
  assert.equal(requiresConfirmation(testRule), false);
  assert.equal(requiresConfirmation(stageRule), false);
  assert.equal(requiresConfirmation({ ...stageRule, confirm: true }), true);
  assert.throws(
    () =>
      checkPublishConfirmation(
        { projectName: 'PDA', rule: testRule },
        { ...testRule, confirm: true },
        { automatic: true },
      ),
    /二次确认/,
  );
  assert.deepEqual(
    quickRules({ rules: [...project().rules, testRule, stageRule] }).map((rule) => rule.id),
    ['test', 'release'],
  );
});

test('同版本不同分支分别保留标签，分支变更作废旧产物并拦截重复组合', () => {
  const old = project();
  const next = updateVersion(old, {
    ruleId: 'stable',
    expectedTarget: '1.0.2',
    expectedBranch: 'master',
    target: '1.0.3',
    branch: 'releaseGray',
    tag: '预发灰度',
  });
  assert.equal(next.rules[0].branch, 'releaseGray');
  assert.equal(next.versionRecords.filter((r) => r.target === '1.0.3').length, 2);
  assert.equal(next.versionRecords.find((r) => r.branch === 'gray').tag, '灰度');
  assert.equal(next.versionRecords.find((r) => r.branch === 'releaseGray').tag, '预发灰度');
  assert.throws(
    () =>
      updateVersion(next, {
        ruleId: 'stable',
        expectedTarget: '1.0.3',
        expectedBranch: 'releaseGray',
        target: '1.0.3',
        branch: 'gray',
        tag: '',
      }),
    /组合不能重复/,
  );
  assert.throws(
    () =>
      updateVersion(next, {
        ruleId: 'stable',
        expectedTarget: '1.0.3',
        expectedBranch: 'master',
        target: '1.0.3',
        branch: 'test',
        tag: '',
      }),
    /分支已被修改/,
  );
  const branchOnly = updateVersion(old, {
    ruleId: 'stable',
    expectedTarget: '1.0.2',
    target: '1.0.2',
    branch: 'new-master',
    tag: '',
  });
  const changes = invalidateVersionTasks(
    [{ id: 'ready', projectId: 'p', status: 'ready', rule: old.rules[0] }],
    'p',
    old,
    branchOnly,
  );
  assert.equal(changes[0].status, 'outdated');
});
