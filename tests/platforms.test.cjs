const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { platformConfig, historyKey } = require('../electron/platforms.cjs');
const { buildBundle, usesHermes } = require('../electron/bundle.cjs');
const old = { id: 'p', app: 'sample-android' };
const both = {
  ...old,
  ios: {
    enabled: true,
    app: 'sample-ios',
    build: { entryFile: '', bundleName: 'main.jsbundle', podFile: 'ios/Podfile', hermes: 'auto' },
  },
};
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pushdesk-ios-'));
  fs.writeFileSync(path.join(dir, 'index.js'), '// entry');
  fs.mkdirSync(path.join(dir, 'ios'));
  return dir;
}

test('旧项目和旧缓存保持 Android 兼容，iOS 历史独立', () => {
  assert.equal(platformConfig(old).platform, 'android');
  assert.equal(platformConfig(old).build.bundleName, 'index.android.bundle');
  assert.equal(historyKey('p', 'Production'), 'p:Production');
  assert.equal(historyKey('p', 'Production', 'ios'), 'p:ios:Production');
  assert.equal(platformConfig(both, 'ios').app, 'sample-ios');
  assert.throws(() => platformConfig(old, 'ios'), /尚未启用/);
});
test('iOS 禁止复用 Android 应用，拒绝越界构建文件', () => {
  assert.throws(
    () => platformConfig({ ...both, ios: { ...both.ios, app: old.app } }, 'ios'),
    /不同的 CodePush/,
  );
  for (const entryFile of ['../outside.js', '/tmp/outside.js', 'C:\\outside.js'])
    assert.throws(
      () =>
        platformConfig(
          { ...both, ios: { ...both.ios, build: { ...both.ios.build, entryFile } } },
          'ios',
        ),
      /相对路径/,
    );
  assert.throws(
    () =>
      platformConfig(
        {
          ...both,
          ios: { ...both.ios, build: { ...both.ios.build, bundleName: '../main.jsbundle' } },
        },
        'ios',
      ),
    /只能是文件名/,
  );
});
test('iOS 打包选择 index.ios.js、main.jsbundle 和 ios 平台，Android 构建不串用', async () => {
  const cwd = fixture();
  try {
    fs.writeFileSync(path.join(cwd, 'index.ios.js'), '// iOS');
    fs.writeFileSync(path.join(cwd, 'index.android.js'), '// Android');
    const calls = [];
    const utils = {
      getHermesEnabled: async () => false,
      runReactNativeBundleCommand: async (...args) => calls.push(args),
      runHermesEmitBinaryCommand: async () => assert.fail('未启用 Hermes'),
    };
    await buildBundle(
      {
        cwd,
        output: path.join(cwd, 'out-ios'),
        platform: 'ios',
        build: { ...both.ios.build, hermes: 'disabled' },
      },
      utils,
    );
    await buildBundle({ cwd, output: path.join(cwd, 'out-android'), platform: 'android' }, utils);
    assert.equal(calls[0][0], 'main.jsbundle');
    assert.equal(calls[0][2], 'index.ios.js');
    assert.equal(calls[0][4], 'ios');
    assert.equal(calls[1][0], 'index.android.bundle');
    assert.equal(calls[1][2], 'index.android.js');
    assert.equal(calls[1][4], 'android');
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
test('iOS Hermes 默认使用现有 CLI 检测，不因动态 Podfile 额外阻断', async () => {
  const cwd = fixture();
  try {
    const cli = require('@shm-open/code-push-cli/bin/lib/react-native-utils');
    const calls = [];
    const utils = {
      getiOSHermesEnabled: (file) => cli.getiOSHermesEnabled(file),
      runReactNativeBundleCommand: async () => calls.push('bundle'),
      runHermesEmitBinaryCommand: async (name) => calls.push(name),
    };
    const input = { cwd, output: path.join(cwd, 'out'), platform: 'ios', build: both.ios.build };
    const podFile = path.join(cwd, 'ios/Podfile');
    for (const syntax of [
      ':hermes_enabled => true',
      ':hermes_enabled => false',
      ':hermes_enabled => flags[:hermes_enabled]',
    ]) {
      fs.writeFileSync(podFile, syntax);
      assert.equal(
        await usesHermes(cwd, 'ios', input.build, utils),
        await cli.getiOSHermesEnabled(podFile),
      );
    }
    await buildBundle(input, utils);
    assert.deepEqual(calls, ['bundle']);
    calls.length = 0;
    await buildBundle({ ...input, build: { ...input.build, hermes: 'enabled' } }, utils);
    assert.deepEqual(calls, ['bundle', 'main.jsbundle']);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test('真实构建子进程把 iOS 参数传给项目内的 RN CLI，并输出独立 Bundle', async () => {
  const { execFile } = require('node:child_process');
  const { promisify } = require('node:util');
  const exec = promisify(execFile);
  const cwd = fixture();
  try {
    const cli = `const fs=require('fs');const args=process.argv.slice(2);const value=name=>args[args.indexOf(name)+1];fs.writeFileSync('received.json',JSON.stringify(args));fs.writeFileSync(value('--bundle-output'),'fixture ios bundle');`;
    const dirs = ['node_modules/.bin', 'node_modules/react-native/local-cli'];
    for (const dir of dirs) fs.mkdirSync(path.join(cwd, dir), { recursive: true });
    fs.writeFileSync(path.join(cwd, 'node_modules/.bin/react-native'), cli);
    fs.writeFileSync(path.join(cwd, 'node_modules/react-native/local-cli/cli.js'), cli);
    fs.writeFileSync(path.join(cwd, 'ios/Podfile'), ':hermes_enabled => false');
    const input = {
      cwd,
      nodeExecutable: process.execPath,
      output: path.join(cwd, 'ios-output'),
      platform: 'ios',
      build: platformConfig({ app: old.app, ios: { enabled: true, app: 'sample-ios' } }, 'ios')
        .build,
    };
    const inputFile = path.join(cwd, 'build.json');
    fs.writeFileSync(inputFile, JSON.stringify(input));
    await exec(
      process.execPath,
      [path.join(__dirname, '../electron/build-worker.cjs'), inputFile],
      {
        env: {
          ...process.env,
          PATH: '',
          ELECTRON_RUN_AS_NODE: '1',
        },
      },
    );
    const args = JSON.parse(fs.readFileSync(path.join(cwd, 'received.json'), 'utf8'));
    assert.equal(args[args.indexOf('--platform') + 1], 'ios');
    assert.equal(args[args.indexOf('--dev') + 1], 'false');
    assert.ok(args.includes('--reset-cache'));
    assert.equal(
      fs.readFileSync(path.join(cwd, 'ios-output/CodePush/main.jsbundle'), 'utf8'),
      'fixture ios bundle',
    );
    assert.equal(fs.existsSync(path.join(cwd, 'ios-output/CodePush/index.android.bundle')), false);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
