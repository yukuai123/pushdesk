const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);

function versionDirectories(root) {
  try {
    return fs.readdirSync(root).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  } catch {
    return [];
  }
}
function nodeCandidates(
  configured = 'node',
  { env = process.env, home = os.homedir(), platform = process.platform } = {},
) {
  const executable = platform === 'win32' ? 'node.exe' : 'node';
  const candidates = [];
  if (path.isAbsolute(configured)) candidates.push(configured);
  for (const dir of (env.PATH || '').split(path.delimiter).filter(Boolean))
    candidates.push(
      path.join(dir, path.basename(configured || executable)),
      path.join(dir, executable),
    );
  if (env.NVM_BIN) candidates.push(path.join(env.NVM_BIN, executable));
  if (env.NVM_SYMLINK) candidates.push(path.join(env.NVM_SYMLINK, executable));
  for (const base of [
    env.NVM_DIR && path.join(env.NVM_DIR, 'versions/node'),
    path.join(home, '.nvm/versions/node'),
  ].filter(Boolean))
    for (const version of versionDirectories(base))
      candidates.push(path.join(base, version, 'bin', executable));
  for (const base of [
    path.join(home, '.fnm/node-versions'),
    path.join(home, '.local/share/fnm/node-versions'),
  ])
    for (const version of versionDirectories(base))
      candidates.push(path.join(base, version, 'installation/bin', executable));
  for (const version of versionDirectories(path.join(home, '.asdf/installs/nodejs')))
    candidates.push(path.join(home, '.asdf/installs/nodejs', version, 'bin', executable));
  candidates.push(path.join(home, '.volta/bin', executable));
  if (platform === 'win32') {
    for (const base of [
      env.ProgramFiles,
      env['ProgramFiles(x86)'],
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs'),
    ].filter(Boolean))
      candidates.push(path.join(base, 'nodejs', executable));
    if (env.NVM_HOME)
      for (const version of versionDirectories(env.NVM_HOME))
        candidates.push(path.join(env.NVM_HOME, version, executable));
  } else candidates.push('/opt/homebrew/bin/node', '/usr/local/bin/node', '/usr/bin/node');
  return [...new Set(candidates.filter((candidate) => path.isAbsolute(candidate)))];
}
function nodeEnvironment(node, base = process.env) {
  const env = {
    ...base,
    PATH: [path.dirname(node), ...(base.PATH || '').split(path.delimiter)]
      .filter(Boolean)
      .join(path.delimiter),
    PUSHDESK_NODE_EXECUTABLE: node,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
async function resolveNode(configured = 'node', options = {}) {
  for (const candidate of nodeCandidates(configured, options)) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      const { stdout } = await execute(candidate, ['--version'], {
        env: nodeEnvironment(candidate, options.env || process.env),
        timeout: 5000,
        windowsHide: true,
      });
      const version = stdout.trim();
      if (/^v\d+\.\d+\.\d+$/.test(version)) return { executable: candidate, version };
    } catch {
      /* Try the next installed runtime, without invoking a shell. */
    }
  }
  throw new Error(
    '未找到可用的 Node.js。请在“服务与设置”选择 Node 可执行文件的绝对路径，或安装 Node.js 后重试。',
  );
}
function managerScript(manager, node) {
  const directory = path.dirname(node);
  const entries =
    manager === 'yarn'
      ? [
          path.join(directory, 'corepack'),
          path.join(directory, 'node_modules/corepack/dist/corepack.js'),
          path.join(directory, '../lib/node_modules/corepack/dist/corepack.js'),
        ]
      : [
          path.join(directory, 'npm'),
          path.join(directory, 'node_modules/npm/bin/npm-cli.js'),
          path.join(directory, '../lib/node_modules/npm/bin/npm-cli.js'),
        ];
  for (const entry of entries) {
    try {
      const file = fs.realpathSync(entry);
      if (
        fs.statSync(file).isFile() &&
        (/\.[cm]?js$/.test(file) ||
          /^#!.*\bnode\b/.test(fs.readFileSync(file, 'utf8').slice(0, 150)))
      )
        return file;
    } catch {}
  }
  throw new Error(
    manager === 'yarn'
      ? '已找到 Node，但缺少 Corepack。请为该 Node 安装 Corepack，或配置项目的 .yarnrc.yml yarnPath。'
      : '已找到 Node，但缺少 npm。请重新安装完整的 Node.js。',
  );
}
function installCommand(manager, node, cwd) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  if (manager === 'yarn') {
    const args = /^yarn@1\./.test(packageJson.packageManager || '')
      ? ['install', '--frozen-lockfile']
      : ['install', '--immutable'];
    const rc = path.join(cwd, '.yarnrc.yml');
    if (fs.existsSync(rc)) {
      const match = fs
        .readFileSync(rc, 'utf8')
        .match(/^\s*yarnPath:\s*["']?([^"'\r\n#]+)["']?\s*$/m);
      if (match) {
        const file = path.resolve(cwd, match[1].trim());
        if (fs.existsSync(file)) return { executable: node, args: [file, ...args] };
      }
    }
    return {
      executable: node,
      args: [managerScript('yarn', node), 'yarn', ...args],
    };
  }
  if (!fs.existsSync(path.join(cwd, 'package-lock.json')))
    throw new Error('缺少 package-lock.json，无法进行锁定依赖安装');
  return { executable: node, args: [managerScript('npm', node), 'ci'] };
}
module.exports = {
  nodeCandidates,
  nodeEnvironment,
  resolveNode,
  installCommand,
};
