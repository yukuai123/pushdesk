const semver = require('semver');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const lanes = {
  stable: '生产正式',
  gray: '生产灰度',
  staging: '预发布',
  test: '测试',
};
function assert(ok, message) {
  if (!ok) throw new Error(message);
}
function validateProject(p) {
  assert(p && typeof p.name === 'string' && p.name.trim(), '请输入项目名称');
  assert(typeof p.path === 'string' && path.isAbsolute(p.path), '请选择项目绝对路径');
  assert(
    typeof p.app === 'string' && p.app.trim() && !p.app.startsWith('-'),
    '请输入 CodePush 应用名',
  );
  assert(Array.isArray(p.rules) && p.rules.length, '请至少配置一条发布规则');
  const seen = new Set();
  for (const r of p.rules) {
    assert(lanes[r.lane], '发布用途无效');
    assert(r.confirm === undefined || typeof r.confirm === 'boolean', '二次确认设置无效');
    assert(
      r.tag === undefined || (typeof r.tag === 'string' && r.tag.trim().length <= 80),
      '备注标签最多 80 个字符',
    );
    assert(
      typeof r.branch === 'string' &&
        /^(?!-)(?!.*\.\.)(?!.*[~^:?*\[\\\s])[^\x00-\x1f]+$/.test(r.branch),
      '分支名称无效',
    );
    assert(
      typeof r.deployment === 'string' && r.deployment.trim() && !r.deployment.startsWith('-'),
      'Deployment 无效',
    );
    assert(
      typeof r.target === 'string' && semver.valid(r.target) === r.target,
      '目标版本必须是完整版本号，例如 1.0.2',
    );
    assert(
      typeof r.envFile === 'string' && /^\.env(?:[.\w-]*)$/.test(r.envFile),
      '环境文件仅支持项目根目录的 .env 文件',
    );
    const key = JSON.stringify([r.target, r.branch]);
    assert(!seen.has(key), '同一项目中，版本号与分支的组合不能重复');
    seen.add(key);
  }
  return p;
}
function effective(history, version) {
  return [...history]
    .sort(
      (a, b) =>
        (b.uploadTime || 0) - (a.uploadTime || 0) ||
        parseInt((b.label || '').slice(1)) - parseInt((a.label || '').slice(1)),
    )
    .find(
      (x) =>
        !x.isDisabled &&
        x.rollout !== 0 &&
        semver.validRange(x.appVersion) &&
        semver.satisfies(version, x.appVersion),
    );
}
function checkServerConflicts(project, rule, history) {
  // An unclassified wildcard/range could deliver to both populations. Require explicit resolution.
  for (const h of history.filter((x) => !x.isDisabled && x.rollout !== 0)) {
    if (!semver.validRange(h.appVersion) || !semver.satisfies(rule.target, h.appVersion)) continue;
    const others = project.rules.filter(
      (r) =>
        r.deployment === rule.deployment &&
        r.lane !== rule.lane &&
        r.target !== rule.target &&
        semver.satisfies(r.target, h.appVersion),
    );
    assert(
      !others.length,
      `服务端 ${h.label} 的目标范围 ${h.appVersion} 同时覆盖正式/灰度配置，请先在服务端调整或禁用重叠范围`,
    );
  }
}
function displayCommand(exe, args = []) {
  return [exe, ...args]
    .map((x) => (/^[a-zA-Z0-9_./:@=-]+$/.test(String(x)) ? x : JSON.stringify(String(x))))
    .join(' ');
}
function redact(s, secrets = []) {
  let t = String(s).replace(/\x1b\[[0-9;]*m/g, '');
  for (const v of secrets.filter(Boolean)) t = t.split(v).join('••••••');
  return t.replace(/(--accessKey[=\s]+)(?:"[^"]*"|\S+)/gi, '$1••••••');
}
function run(exe, args, { cwd, env, onLog = () => {}, timeout = 120000 } = {}) {
  onLog('$ ' + displayCommand(exe, args), 'command');
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let result = '';
    let err = '';
    let timed = false;
    const timer = setTimeout(() => {
      timed = true;
      child.kill();
    }, timeout);
    child.stdout.on('data', (b) => {
      const s = b.toString();
      result = (result + s).slice(-5e6);
      onLog(s, 'output');
    });
    child.stderr.on('data', (b) => {
      const s = b.toString();
      err = (err + s).slice(-10000);
      onLog(s, 'output');
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || timed)
        reject(
          new Error(
            timed
              ? '命令执行超时'
              : `${path.basename(exe)} 执行失败 (${code})\n${err.slice(-3000)}`,
          ),
        );
      else resolve(result.trim());
    });
  });
}
function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
function normalizeHistory(items) {
  return (items || []).map((x) => ({
    label: x.label,
    appVersion: x.appVersion,
    description: x.description || '',
    uploadTime: x.uploadTime || 0,
    isMandatory: !!x.isMandatory,
    isDisabled: !!x.isDisabled,
    rollout: x.rollout ?? 100,
    packageHash: x.packageHash || '',
    size: x.size || 0,
    releasedBy: x.releasedBy || '',
    originalLabel: x.originalLabel || '',
  }));
}
function classify(h, rules) {
  const matches = rules.filter(
    (r) => semver.validRange(h.appVersion) && semver.satisfies(r.target, h.appVersion),
  );
  return [...new Set(matches.map((r) => r.lane))];
}
module.exports = {
  lanes,
  assert,
  validateProject,
  effective,
  checkServerConflicts,
  displayCommand,
  redact,
  run,
  sha,
  normalizeHistory,
  classify,
};
