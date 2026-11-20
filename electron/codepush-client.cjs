const { spawn } = require('node:child_process');
const path = require('node:path');
const C = require('./core.cjs');

// Credentials travel over stdin and never become command-line arguments.
function createCodePushClient({ settings, token, rememberToken, log }) {
  return async function sdk(method, args = [], custom) {
    const s = settings();
    const key = custom?.token || token();
    rememberToken(key);
    const url = custom?.url || s.url;
    C.assert(url, '请配置服务地址');
    log(
      `SDK ${method}(${args.map((x) => (typeof x === 'string' ? JSON.stringify(x) : '[metadata]')).join(', ')})`,
      'command',
    );
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(__dirname, 'sdk-worker.cjs')], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let output = '';
      const timer = setTimeout(
        () => {
          child.kill();
          reject(new Error('网络请求超时；发布任务必须回查，不能直接重试'));
        },
        method === 'release' ? 180000 : 30000,
      );
      child.stdout.on('data', (b) => (output += b));
      child.stderr.on('data', () => {});
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on('close', () => {
        clearTimeout(timer);
        try {
          const r = JSON.parse(output);
          if (!r.ok) {
            const e = new Error(
              r.status === 401
                ? 'Token 已失效，请更新 Token'
                : r.status === 403
                  ? '当前账号权限不足'
                  : r.error,
            );
            e.status = r.status;
            reject(e);
          } else resolve(r.data);
        } catch (e) {
          reject(e);
        }
      });
      child.stdin.end(JSON.stringify({ token: key, url, method, args }));
    });
  };
}
module.exports = { createCodePushClient };
