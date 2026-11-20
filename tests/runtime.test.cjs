const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const { resolveNode, nodeEnvironment, installCommand } = require('../electron/runtime.cjs');

function fixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pushdesk-runtime-'));
  const bin = path.join(cwd, '.nvm/versions/node/v22.12.0/bin');
  fs.mkdirSync(bin, { recursive: true });
  const node = path.join(bin, process.platform === 'win32' ? 'node.exe' : 'node');
  fs.symlinkSync(process.execPath, node);
  fs.writeFileSync(
    path.join(cwd, 'package.json'),
    JSON.stringify({ packageManager: 'yarn@3.6.4' }),
  );
  fs.writeFileSync(path.join(cwd, 'yarn.lock'), '');
  const corepack = path.join(bin, 'node_modules/corepack/dist/corepack.js');
  fs.mkdirSync(path.dirname(corepack), { recursive: true });
  fs.writeFileSync(
    corepack,
    `require('fs').writeFileSync('received.json',JSON.stringify({args:process.argv.slice(2), electron:process.env.ELECTRON_RUN_AS_NODE, node:process.env.PUSHDESK_NODE_EXECUTABLE}));process.exit(Number(process.env.FIXTURE_EXIT||0));`,
  );
  return { cwd, node };
}

test('桌面 PATH 为空时自动定位 NVM Node，安装子进程使用绝对路径并清除 Electron 标记', async () => {
  const { cwd, node } = fixture();
  try {
    const runtime = await resolveNode('node', { home: cwd, env: { PATH: '' } });
    assert.equal(runtime.executable, node);
    assert.match(runtime.version, /^v\d+\.\d+\.\d+$/);
    const env = {
      ...nodeEnvironment(node, { ...process.env, PATH: '', ELECTRON_RUN_AS_NODE: '1' }),
    };
    assert.equal(env.ELECTRON_RUN_AS_NODE, undefined);
    const worker = path.join(__dirname, '../electron/install-worker.cjs');
    await exec(process.execPath, [worker, 'yarn'], { cwd, env });
    const received = JSON.parse(fs.readFileSync(path.join(cwd, 'received.json'), 'utf8'));
    assert.deepEqual(received.args, ['yarn', 'install', '--immutable']);
    assert.equal(received.node, node);
    assert.equal(received.electron, undefined);
    await assert.rejects(
      exec(process.execPath, [worker, 'yarn'], { cwd, env: { ...env, FIXTURE_EXIT: '9' } }),
      (error) => error.code === 9,
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('支持项目 yarnPath 和 npm ci，不再通过 shell 查找裸 node/corepack', () => {
  const { cwd, node } = fixture();
  try {
    fs.mkdirSync(path.join(cwd, '.yarn/releases'), { recursive: true });
    const yarn = path.join(cwd, '.yarn/releases/yarn.cjs');
    fs.writeFileSync(yarn, '');
    fs.writeFileSync(path.join(cwd, '.yarnrc.yml'), 'yarnPath: ".yarn/releases/yarn.cjs"\n');
    assert.deepEqual(installCommand('yarn', node, cwd), {
      executable: node,
      args: [yarn, 'install', '--immutable'],
    });
    assert.throws(() => installCommand('npm', node, cwd), /package-lock/);
    fs.writeFileSync(path.join(cwd, 'package-lock.json'), '{}');
    const npm = path.join(path.dirname(node), 'node_modules/npm/bin/npm-cli.js');
    fs.mkdirSync(path.dirname(npm), { recursive: true });
    fs.writeFileSync(npm, '');
    assert.deepEqual(installCommand('npm', node, cwd), {
      executable: node,
      args: [fs.realpathSync(npm), 'ci'],
    });
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
