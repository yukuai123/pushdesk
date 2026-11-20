const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sha } = require('../electron/core.cjs');
const A = require('../electron/android-packages.cjs');
const noop = () => {};
const rule = { id: 'test', lane: 'test', target: '1.0.2', branch: 'test', envFile: '.env.test' };
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pushdesk-apk-'));
  const source = path.join(dir, 'repo');
  fs.mkdirSync(source);
  const sdk = path.join(dir, 'sdk');
  fs.mkdirSync(sdk);
  const jdk = path.join(dir, 'jdk');
  fs.mkdirSync(path.join(jdk, 'bin'), { recursive: true });
  fs.writeFileSync(
    path.join(jdk, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'),
    'fixture',
    { mode: 0o755 },
  );
  return { dir, source, settings: { javaHome: jdk, androidSdk: sdk, git: 'git' } };
}
function androidSource(source) {
  fs.mkdirSync(path.join(source, 'android/app'), { recursive: true });
  fs.writeFileSync(path.join(source, 'android/gradlew'), 'fixture');
  fs.writeFileSync(path.join(source, 'android/gradlew.bat'), 'fixture');
  fs.writeFileSync(
    path.join(source, 'android/app/build.gradle'),
    'android {productFlavors { development { } stage { } production { } }}',
  );
  fs.writeFileSync(
    path.join(source, 'package.json'),
    JSON.stringify({ packageManager: 'yarn@3.6.4' }),
  );
  fs.writeFileSync(path.join(source, '.env.test'), 'fixture');
}

test('Android 根据用途匹配具体变体，支持手动变体、任务、Windows Wrapper，拒绝目录越界和命令注入', () => {
  const { dir, source } = fixture();
  try {
    androidSource(source);
    const project = { rules: [rule] };
    assert.equal(A.buildPlan(project, rule, 'debug', source).task, ':app:assembleDevelopmentDebug');
    assert.equal(
      A.buildPlan(project, { ...rule, lane: 'staging' }, 'release', source).task,
      ':app:assembleStageRelease',
    );
    assert.equal(
      A.buildPlan(project, { ...rule, lane: 'gray' }, 'release', source).task,
      ':app:assembleProductionRelease',
    );
    assert.equal(
      A.buildPlan(project, { ...rule, androidFlavor: 'custom' }, 'debug', source).task,
      ':app:assembleCustomDebug',
    );
    assert.equal(
      A.buildPlan(project, rule, 'debug', source, 'win32').args[3],
      'gradlew.bat :app:assembleDevelopmentDebug --console=plain --no-daemon',
    );
    assert.equal(
      A.buildPlan(
        { ...project, android: { debugTask: ':app:assembleSpecialDebug' } },
        rule,
        'debug',
        source,
      ).task,
      ':app:assembleSpecialDebug',
    );
    for (const android of [
      { directory: '../outside' },
      { apkDirectory: '/tmp' },
      { debugTask: 'assembleDebug && curl evil' },
    ])
      assert.throws(() => A.androidConfig({ android }));
    assert.throws(() => A.androidConfig({ rules: [{ ...rule, androidFlavor: 'evil;rm' }] }));
    fs.writeFileSync(
      path.join(source, 'android/app/build.gradle'),
      'android {productFlavors { alpha {} beta {} }}',
    );
    assert.throws(() => A.buildPlan(project, rule, 'debug', source), /无法自动确定/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('打包先成功 fetch 固定提交，再安装和 Gradle 构建；只保存 APK，不调用 adb，保留产物后清理 worktree', async () => {
  const { dir, source, settings } = fixture();
  const calls = [];
  const commit = 'a'.repeat(40);
  const folder = path.join(dir, 'result');
  const run = async (exe, args, options) => {
    calls.push({ exe, args, options });
    if (args[0] === 'fetch') return '';
    if (args[0] === 'rev-parse') return commit;
    if (args[0] === 'worktree' && args[1] === 'add') {
      androidSource(args[3]);
      return '';
    }
    if (exe === '/bin/sh' || /cmd\.exe$/.test(exe)) {
      assert.equal(options.env.ENVFILE, '.env.test');
      assert.equal(options.env.NODE_BINARY, process.execPath);
      const output = path.join(options.cwd, 'app/build/outputs/apk/development/debug');
      fs.mkdirSync(output, { recursive: true });
      fs.writeFileSync(
        path.join(output, 'app-development-universal-debug.apk'),
        'signed fixture APK',
      );
      return '';
    }
    if (args[0] === 'worktree' && args[1] === 'remove') {
      fs.rmSync(args[3], { recursive: true, force: true });
      return '';
    }
    return '';
  };
  try {
    const result = await A.buildAndroidPackage({
      project: { path: source, rules: [rule] },
      rule,
      variant: 'debug',
      folder,
      node: process.execPath,
      settings,
      installWorker: 'install-worker.cjs',
      workerExecutable: process.execPath,
      log: noop,
      run,
    });
    assert.equal(result.commit, commit);
    assert.equal(result.task, ':app:assembleDevelopmentDebug');
    assert.equal(fs.readFileSync(result.apks[0].path, 'utf8'), 'signed fixture APK');
    assert.equal(result.apks[0].sha256, sha(result.apks[0].path));
    assert.ok(
      calls.findIndex((call) => call.args[0] === 'fetch') <
        calls.findIndex((call) => call.args[0] === 'worktree'),
    );
    assert.equal(
      calls.some((call) => call.exe.includes('adb') || call.args.includes('install')),
      false,
    );
    assert.equal(fs.existsSync(path.join(folder, 'source')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('拉取失败时不继续安装或 Gradle 构建，也不创建 worktree', async () => {
  const { dir, source, settings } = fixture();
  const calls = [];
  try {
    await assert.rejects(
      A.buildAndroidPackage({
        project: { path: source, rules: [rule] },
        rule,
        variant: 'release',
        folder: path.join(dir, 'result'),
        node: process.execPath,
        settings,
        installWorker: 'worker',
        workerExecutable: process.execPath,
        log: noop,
        run: async (exe, args) => {
          calls.push(args);
          if (args[0] === 'fetch') throw Error('HTTP 502');
          return '';
        },
      }),
      /502/,
    );
    assert.equal(calls.length, 2);
    assert.equal(
      calls.some((args) => args[0] === 'worktree'),
      false,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('手动安装明确指定 serial 和 APK；拒绝离线、物理设备、篡改文件，签名冲突不卸载', async () => {
  const { dir } = fixture();
  try {
    const apk = path.join(dir, 'local.apk');
    fs.writeFileSync(apk, 'fixture');
    const build = {
      status: 'ready',
      apks: [{ id: 'apk', path: apk, name: 'local.apk', sha256: sha(apk) }],
    };
    const calls = [];
    let conflict = false;
    const run = async (exe, args, options) => {
      calls.push(args);
      if (args[0] === 'devices')
        return 'List of devices attached\nemulator-5554 device product:sdk model:Pixel_7\nemulator-5556 offline\nphysical device model:Phone\n127.0.0.1:5555 device model:Remote_Emulator\n';
      if (args.includes('getprop')) return args[1] === '127.0.0.1:5555' ? '1' : '0';
      if (args.includes('install')) {
        if (conflict) {
          options.onLog('Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]', 'output');
          throw Error('install failed');
        }
        return 'Performing Streamed Install\nSuccess';
      }
    };
    const result = await A.installAndroidApk({
      build,
      apkId: 'apk',
      serial: 'emulator-5554',
      adb: '/sdk/adb',
      log: noop,
      run,
    });
    assert.equal(result.serial, 'emulator-5554');
    assert.deepEqual(
      calls.find((args) => args.includes('install')),
      ['-s', 'emulator-5554', 'install', '-r', apk],
    );
    for (const serial of ['emulator-5556', 'physical', 'missing'])
      await assert.rejects(
        A.installAndroidApk({ build, apkId: 'apk', serial, adb: 'adb', log: noop, run }),
        /请选择/,
      );
    const remote = (await A.listAndroidDevices('adb', noop, run)).find(
      (device) => device.serial === '127.0.0.1:5555',
    );
    assert.equal(remote.emulator, true);
    conflict = true;
    await assert.rejects(
      A.installAndroidApk({
        build,
        apkId: 'apk',
        serial: 'emulator-5554',
        adb: 'adb',
        log: noop,
        run,
      }),
      /签名不一致/,
    );
    assert.equal(
      calls.some((args) => args.includes('uninstall')),
      false,
    );
    fs.writeFileSync(apk, 'modified');
    await assert.rejects(
      A.installAndroidApk({
        build,
        apkId: 'apk',
        serial: 'emulator-5554',
        adb: 'adb',
        log: noop,
        run,
      }),
      /文件已改变/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('不把 unsigned APK 或指向其他目录的符号链接作为产物', () => {
  const { dir, source } = fixture();
  try {
    fs.writeFileSync(path.join(source, 'app-release-unsigned.apk'), 'unsigned');
    fs.writeFileSync(path.join(source, 'app-universal-debug.apk'), 'signed');
    fs.symlinkSync(path.join(source, 'app-universal-debug.apk'), path.join(source, 'linked.apk'));
    assert.deepEqual(A.apkFiles(source), [path.join(source, 'app-universal-debug.apk')]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('正式包自动复用项目 Fastlane，按用途选择 lane；调试包保留 Gradle，允许覆盖 lane 和 Bundler', () => {
  const { dir, source } = fixture();
  try {
    androidSource(source);
    fs.mkdirSync(path.join(source, 'fastlane'));
    fs.writeFileSync(
      path.join(source, 'fastlane/Fastfile'),
      'platform :android do\n lane :build_stage do\n end\nend',
    );
    const project = { rules: [rule] };
    const tools = { fastlane: process.execPath, bundle: process.execPath };
    assert.equal(
      A.fastlanePlan(project, { ...rule, lane: 'staging' }, 'release', source, tools).task,
      'fastlane android build_stage',
    );
    assert.deepEqual(
      A.fastlanePlan(project, { ...rule, lane: 'stable' }, 'release', source, tools).args,
      ['android', 'build_prod'],
    );
    assert.equal(A.fastlanePlan(project, rule, 'debug', source, tools), null);
    assert.equal(
      A.fastlanePlan(
        { ...project, android: { releaseRunner: 'gradle' } },
        rule,
        'release',
        source,
        tools,
      ),
      null,
    );
    assert.deepEqual(
      A.fastlanePlan(project, { ...rule, androidLane: 'custom_apk' }, 'release', source, tools)
        .args,
      ['android', 'custom_apk'],
    );
    fs.writeFileSync(path.join(source, 'Gemfile'), "gem 'cocoapods'\n");
    assert.equal(A.fastlanePlan(project, rule, 'release', source, tools).bundled, false);
    fs.writeFileSync(path.join(source, 'Gemfile'), "gem 'fastlane'\n");
    assert.deepEqual(A.fastlanePlan(project, rule, 'release', source, tools).args, [
      'exec',
      'fastlane',
      'android',
      'build_test',
    ]);
    assert.throws(
      () => A.androidConfig({ rules: [{ ...rule, androidLane: 'build;upload' }] }),
      /lane/,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('正式包流程调用 Fastlane lane 并保存 APK，不执行 Gradle 命令或 adb 安装', async () => {
  const { dir, source, settings } = fixture();
  const calls = [];
  const commit = 'b'.repeat(40);
  const folder = path.join(dir, 'release');
  try {
    const result = await A.buildAndroidPackage({
      project: { path: source, rules: [rule] },
      rule: { ...rule, lane: 'staging', envFile: '.env.staging' },
      variant: 'release',
      folder,
      node: process.execPath,
      settings: { ...settings, fastlane: process.execPath },
      installWorker: 'install-worker.cjs',
      workerExecutable: process.execPath,
      log: noop,
      run: async (exe, args, options) => {
        calls.push({ exe, args });
        if (args[0] === 'rev-parse') return commit;
        if (args[0] === 'worktree' && args[1] === 'add') {
          androidSource(args[3]);
          fs.mkdirSync(path.join(args[3], 'fastlane'));
          fs.writeFileSync(
            path.join(args[3], 'fastlane/Fastfile'),
            'platform :android do\n lane :build_stage do\n end\nend',
          );
          return '';
        }
        if (args[0] === 'android') {
          assert.deepEqual(args, ['android', 'build_stage']);
          assert.equal(options.env.CI, '1');
          const target = path.join(options.cwd, 'android/app/build/outputs/apk/stage/release');
          fs.mkdirSync(target, { recursive: true });
          fs.writeFileSync(path.join(target, 'app-stage-release.apk'), 'release fixture');
          return '';
        }
        if (args[0] === 'worktree' && args[1] === 'remove')
          fs.rmSync(args[3], { recursive: true, force: true });
        return '';
      },
    });
    assert.equal(result.task, 'fastlane android build_stage');
    assert.equal(result.apks[0].name, 'app-stage-release.apk');
    assert.equal(
      calls.some((call) => call.args.some((arg) => /assemble|adb/.test(arg))),
      false,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
