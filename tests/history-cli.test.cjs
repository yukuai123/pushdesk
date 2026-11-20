const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createHistoryClient, historyCommand } = require('../electron/history-client.cjs');
test('实际 CodePush CLI 只请求所选部署目标，并返回 JSON 原始记录', async () => {
  const paths = [],
    logs = [];
  const server = http.createServer((request, response) => {
    paths.push(request.url);
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/account')
      return response.end(JSON.stringify({ account: { email: 'fixture@example.invalid' } }));
    if (request.url.endsWith('/metrics')) return response.end(JSON.stringify({ metrics: {} }));
    const match = request.url.match(
      /^\/apps\/sample-ios\/deployments\/(Production|Staging|Deployment)\/history$/,
    );
    if (match)
      return response.end(
        JSON.stringify({
          history: [{ label: 'v1', appVersion: '1.0.6', description: match[1], uploadTime: 1 }],
        }),
      );
    response.statusCode = 401;
    response.end(JSON.stringify({ message: 'Unauthorized' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const token = 'fixture-token-not-for-logs';
    const query = createHistoryClient({
      settings: () => ({ url: `http://127.0.0.1:${server.address().port}` }),
      token: () => token,
      log: (text) => logs.push(text),
    });
    for (const deployment of ['Production', 'Staging', 'Deployment']) {
      paths.length = 0;
      const rows = await query('sample-ios', deployment);
      assert.equal(rows[0].description, deployment);
      assert.equal(paths.filter((path) => path.endsWith('/history')).length, 1);
      assert.ok(paths.includes(`/apps/sample-ios/deployments/${deployment}/history`));
      assert.ok(
        logs.some((text) =>
          text.includes(`code-push deployment history sample-ios ${deployment} --format json`),
        ),
      );
    }
    assert.ok(logs.every((text) => !text.includes(token)));
    await assert.rejects(
      () => query('missing', 'Production'),
      (error) => error.status === 401,
    );
    assert.throws(() => historyCommand('sample', '--help'), /部署目标/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
