const { spawn } = require('node:child_process');
const path = require('node:path');
const { assert, displayCommand } = require('./core.cjs');
function historyCommand(app, deployment) {
  assert(typeof app === 'string' && app.trim() && !app.startsWith('-'), 'CodePush 应用名无效');
  assert(
    typeof deployment === 'string' && deployment.trim() && !deployment.startsWith('-'),
    '部署目标无效',
  );
  return ['deployment', 'history', app, deployment, '--format', 'json'];
}
function createHistoryClient({ settings, token, log }) {
  return async function queryHistory(app, deployment) {
    const args = historyCommand(app, deployment);
    const key = token();
    const url = settings().url;
    assert(url, '请先配置服务地址');
    log('$ ' + displayCommand('code-push', args), 'command');
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(__dirname, 'history-worker.cjs'), ...args], {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          NO_UPDATE_NOTIFIER: '1',
          FORCE_COLOR: '0',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let output = '',
        errors = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('查询发布历史超时，请检查内网连接后重试'));
      }, 30000);
      child.stdout.on('data', (chunk) => {
        output += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        errors += chunk.toString();
      });
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        try {
          if (code !== 0) {
            let info = { error: errors || 'CodePush 历史查询失败' };
            try {
              const framed = errors
                .split('\n')
                .findLast((line) => line.startsWith('PUSHDESK_ERROR '));
              info = JSON.parse(framed ? framed.slice('PUSHDESK_ERROR '.length) : errors);
            } catch {}
            const error = new Error(
              info.status === 401
                ? '访问令牌已失效，请更新后重试'
                : info.status === 403
                  ? '当前账号没有查询权限'
                  : info.error,
            );
            error.status = info.status;
            throw error;
          }
          const items = JSON.parse(output.trim());
          assert(Array.isArray(items), 'CodePush 返回的发布历史格式无效');
          log(output.trim(), 'output');
          resolve(items);
        } catch (error) {
          reject(error);
        }
      });
      child.stdin.end(JSON.stringify({ token: key, url }));
    });
  };
}
module.exports = { createHistoryClient, historyCommand };
