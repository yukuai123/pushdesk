const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runBuildStage } = require('../electron/build-logs.cjs');

test('构建阶段保留分块输出并提取实际命令，进度只随阶段开始和完成更新', async () => {
  const logs = [];
  const result = await runBuildStage(
    '安装依赖',
    async (onLog) => {
      onLog('$ electron install-worker.cjs', 'command');
      onLog('instal', 'output');
      onLog('ling\n$ /absolute/no', 'output');
      onLog('de yarn.cjs install\nprogress 1\rprogress 2\nlast line', 'output');
      return 'ok';
    },
    (text, kind, metadata) => logs.push({ text, kind, ...metadata }),
  );
  assert.equal(result, 'ok');
  assert.deepEqual(
    logs.filter((log) => log.stage).map((log) => log.stage.status),
    ['running', 'success'],
  );
  assert.deepEqual(
    logs.filter((log) => log.kind === 'command').map((log) => log.text),
    ['$ electron install-worker.cjs', '$ /absolute/node yarn.cjs install'],
  );
  assert.deepEqual(
    logs.filter((log) => log.kind === 'output').map((log) => log.text),
    ['installing', 'progress 1', 'progress 2', 'last line'],
  );
  assert.equal(new Set(logs.map((log) => log.groupId)).size, 1);
});

test('失败保留错误详情并结束当前阶段，不吞掉原始异常', async () => {
  const logs = [];
  const failure = new Error('missing package');
  await assert.rejects(
    runBuildStage(
      '构建应用',
      async (onLog) => {
        onLog('bundle output without newline', 'output');
        throw failure;
      },
      (text, kind, metadata) => logs.push({ text, kind, ...metadata }),
    ),
    (error) => error === failure,
  );
  assert.equal(logs.at(-1).stage.status, 'error');
  assert.equal(logs.at(-1).text, '构建应用 · 失败');
  assert.ok(logs.some((log) => log.text === 'missing package' && !log.stage));
  assert.ok(logs.some((log) => log.text === 'bundle output without newline'));
});

test('大量构建输出优先淘汰详情，保留实际命令和阶段状态', () => {
  const { appendLog } = require('../electron/build-logs.cjs');
  const rows = [];
  appendLog(rows, { kind: 'command', text: '$ git fetch' }, 5);
  appendLog(rows, { kind: 'progress', groupId: 'build', stage: { status: 'running' } }, 5);
  for (let i = 0; i < 20; i++)
    appendLog(rows, { kind: 'output', groupId: 'build', text: String(i) }, 5);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].text, '$ git fetch');
  assert.equal(rows[1].stage.status, 'running');
  assert.equal(rows.at(-1).text, '19');
});
