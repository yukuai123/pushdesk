const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');
function worker(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, '../electron/sdk-worker.cjs')], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (b) => (out += b));
    child.on('error', reject);
    child.on('close', () => {
      try {
        resolve(JSON.parse(out));
      } catch (e) {
        reject(e);
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}
test('SDK 子进程可鉴权并读取历史，401 返回独立状态', async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/authenticated') {
      res.end('{}');
    } else if (req.url === '/apps/demo/deployments/Production/history') {
      res.end(JSON.stringify({ history: [{ label: 'v8', appVersion: '1.0.3' }] }));
    } else {
      res.statusCode = 401;
      res.end(JSON.stringify({ message: 'Unauthorized' }));
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const base = { url: `http://127.0.0.1:${server.address().port}`, token: 'local-test-token' };
    assert.equal((await worker({ ...base, method: 'isAuthenticated', args: [true] })).data, true);
    const result = await worker({
      ...base,
      method: 'getDeploymentHistory',
      args: ['demo', 'Production'],
    });
    assert.equal(result.data[0].label, 'v8');
    const denied = await worker({
      ...base,
      method: 'getDeploymentHistory',
      args: ['missing', 'Production'],
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.status, 401);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
