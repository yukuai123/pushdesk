const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const yarn = process.argv[2] === 'yarn';
let exe, args;
if (yarn) {
  exe = 'corepack';
  args = ['yarn', 'install', '--immutable'];
} else {
  exe = 'npm';
  args = ['ci'];
  if (!fs.existsSync('package-lock.json'))
    throw new Error('缺少 package-lock.json，无法进行锁定依赖安装');
}
if (process.platform === 'win32') {
  // Invoke known npm/corepack JS entry points instead of shell interpolation.
  const base = path.dirname(process.execPath);
  const script = yarn
    ? path.join(base, 'node_modules/corepack/dist/corepack.js')
    : path.join(base, 'node_modules/npm/bin/npm-cli.js');
  if (!fs.existsSync(script)) throw new Error('请安装 Node.js 的 npm/Corepack 组件');
  args = [script, ...(yarn ? ['yarn', 'install', '--immutable'] : ['ci'])];
  exe = process.execPath;
}
console.log('$ ' + exe + ' ' + args.join(' '));
const child = spawn(exe, args, { stdio: 'inherit', shell: false, windowsHide: true });
child.on('error', (e) => {
  console.error(e.message);
  process.exitCode = 1;
});
child.on('exit', (code) => (process.exitCode = code || 0));
