const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../electron/core.cjs');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../electron/store.cjs');
const rule = (lane, target) => ({
  id: lane,
  lane,
  target,
  branch: lane === 'stable' ? 'master' : 'gray',
  deployment: 'Production',
  envFile: '.env.prod',
});
const project = () => ({
  id: 'p',
  name: 'PDA',
  path: '/tmp/pda',
  app: 'pda-android',
  rules: [rule('stable', '1.0.2'), rule('gray', '1.0.3')],
});
test('配置按版本号加分支唯一，同版本的不同分支可共存', () => {
  assert.equal(C.validateProject(project()).rules.length, 2);
  const p = project();
  p.rules[1].target = '1.0.2';
  assert.doesNotThrow(() => C.validateProject(p));
  assert.doesNotThrow(() => C.checkServerConflicts(p, p.rules[0], [{ appVersion: '1.0.2' }]));
  p.rules[1].branch = 'master';
  p.rules[1].deployment = 'Staging';
  assert.throws(() => C.validateProject(p), /版本号与分支的组合不能重复/);
});
test('只接受明确版本，拒绝范围和危险分支', () => {
  for (const v of ['*', '^1.0.0', '1.0', 'v1.0.2']) {
    const p = project();
    p.rules[0].target = v;
    assert.throws(() => C.validateProject(p));
  }
  const p = project();
  p.rules[0].branch = '--upload-pack=evil';
  assert.throws(() => C.validateProject(p));
});
test('当前匹配跳过禁用发布，保留目标版本边界', () => {
  const h = [
    { label: 'v3', appVersion: '1.0.3', uploadTime: 3 },
    { label: 'v2', appVersion: '1.0.2', uploadTime: 2, isDisabled: true },
    { label: 'v1', appVersion: '1.0.2', uploadTime: 1 },
  ];
  assert.equal(C.effective(h, '1.0.2').label, 'v1');
  assert.equal(C.effective(h, '1.0.3').label, 'v3');
  assert.equal(C.effective(h, '2.0.0'), undefined);
});
test('服务端通配范围覆盖正式与灰度时阻止发布', () => {
  assert.throws(
    () =>
      C.checkServerConflicts(project(), rule('stable', '1.0.2'), [
        { label: 'v2', appVersion: '*' },
      ]),
    /同时覆盖/,
  );
  assert.doesNotThrow(() =>
    C.checkServerConflicts(project(), rule('stable', '1.0.2'), [
      { label: 'v2', appVersion: '1.0.3' },
    ]),
  );
});
test('Token 从日志和命令中脱敏', () => {
  assert.equal(
    C.redact('secret-token --accessKey other-token', ['secret-token']),
    '•••••• --accessKey ••••••',
  );
});
test('参数通过 argv 执行，不交给 shell', async () => {
  const result = await C.run(process.execPath, [
    '-e',
    'process.stdout.write(process.argv[1])',
    '$(echo hacked); test',
  ]);
  assert.equal(result, '$(echo hacked); test');
});
test('SQLite 保存重启后的项目和待回查状态', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pushdesk-test-'));
  try {
    const a = await new Store().init(dir);
    a.put('projects', [project()]);
    a.task({ id: 'one', status: 'unknown' });
    const b = await new Store().init(dir);
    assert.equal(b.get('projects', [])[0].name, 'PDA');
    assert.equal(b.tasks()[0].status, 'unknown');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
