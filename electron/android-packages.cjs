const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { assert, sha, run: defaultRun } = require('./core.cjs');
const { nodeEnvironment } = require('./runtime.cjs');
const { runBuildStage } = require('./build-logs.cjs');

const defaults = {
  directory: 'android',
  debugTask: ':app:assemble{flavor}Debug',
  releaseTask: ':app:assemble{flavor}Release',
  apkDirectory: 'app/build/outputs/apk',
  releaseRunner: 'auto',
  fastlaneDirectory: '.',
  fastlaneBundler: 'auto',
};
function relativePath(value, label) {
  assert(
    typeof value === 'string' &&
      value &&
      !path.isAbsolute(value) &&
      !/^[A-Za-z]:|\\|[\x00-\x1f]/.test(value) &&
      !value.split('/').includes('..'),
    `${label}必须是项目内的相对路径`,
  );
  return value;
}
function inside(root, relative, label) {
  const file = path.resolve(root, relativePath(relative, label));
  if (fs.existsSync(file)) {
    const actual = path.relative(fs.realpathSync(root), fs.realpathSync(file));
    assert(
      actual !== '..' && !actual.startsWith('..' + path.sep) && !path.isAbsolute(actual),
      `${label}不能指向项目目录之外`,
    );
  }
  return file;
}
function androidConfig(project) {
  const config = { ...defaults, ...project.android };
  relativePath(config.directory, 'Android 工程目录');
  relativePath(config.apkDirectory, 'APK 输出目录');
  relativePath(config.fastlaneDirectory, 'Fastlane 工作目录');
  assert(['auto', 'gradle', 'fastlane'].includes(config.releaseRunner), '正式包构建方式无效');
  assert(['auto', 'yes', 'no'].includes(config.fastlaneBundler), 'Bundler 设置无效');
  for (const key of ['debugTask', 'releaseTask']) {
    assert(
      typeof config[key] === 'string' &&
        /^:?[A-Za-z0-9_:-]+$/.test(config[key].replaceAll('{flavor}', 'Flavor')),
      'Gradle 任务只支持单个任务名，例如 :app:assemble{flavor}Debug',
    );
  }
  for (const rule of project.rules || []) {
    assert(
      rule.androidLane === undefined || /^[A-Za-z_][A-Za-z0-9_]*$/.test(rule.androidLane),
      'Fastlane lane 名称无效',
    );
    assert(
      rule.androidFlavor === undefined || /^[A-Za-z0-9_]*$/.test(rule.androidFlavor),
      'Android 变体仅支持字母、数字和下划线',
    );
  }
  return config;
}
function flavorsIn(source) {
  // Read the common Groovy/Kotlin productFlavors block without executing Gradle configuration.
  const clean = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  const start = /productFlavors\s*\{/.exec(clean);
  if (!start) return { present: false, names: [] };
  let depth = 1;
  let buffer = '';
  const names = [];
  for (let i = start.index + start[0].length; i < clean.length && depth; i++) {
    const char = clean[i];
    if (char === '{') {
      if (depth === 1) {
        const match = buffer.match(
          /(?:^|[\n;}])\s*(?:([A-Za-z_]\w*)|(?:create|register)\s*\(\s*["']([A-Za-z_]\w*)["']\s*\))\s*$/,
        );
        if (match) names.push(match[1] || match[2]);
      }
      depth++;
      buffer = '';
    } else if (char === '}') {
      depth--;
      buffer = '';
    } else if (depth === 1) buffer += char;
  }
  return { present: true, names };
}
function buildPlan(project, rule, variant, source, platform = process.platform) {
  assert(['debug', 'release'].includes(variant), '安装包类型无效');
  const config = androidConfig(project);
  const directory = inside(source, config.directory, 'Android 工程目录');
  const template = config[variant + 'Task'];
  let flavor = rule.androidFlavor;
  if (flavor === undefined && template.includes('{flavor}')) {
    const gradle = ['app/build.gradle', 'app/build.gradle.kts']
      .map((file) => path.join(directory, file))
      .find((file) => fs.existsSync(file));
    const found = flavorsIn(gradle ? fs.readFileSync(gradle, 'utf8') : '');
    const candidates =
      {
        test: ['development', 'test', 'dev'],
        staging: ['stage', 'staging', 'release'],
        gray: ['gray', 'production', 'prod'],
        stable: ['production', 'prod', 'stable'],
      }[rule.lane] || [];
    flavor = candidates.find((name) => found.names.some((item) => item.toLowerCase() === name));
    if (flavor) flavor = found.names.find((name) => name.toLowerCase() === flavor);
    else if (found.names.length === 1) flavor = found.names[0];
    else {
      assert(
        !found.present,
        '无法自动确定 Android 变体，请在这条版本规则中填写变体，或配置完整的 Gradle 任务',
      );
      flavor = '';
    }
  }
  const suffix = flavor ? flavor[0].toUpperCase() + flavor.slice(1) : '';
  const task = template.replaceAll('{flavor}', suffix);
  const wrapper = path.join(directory, platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  assert(fs.existsSync(wrapper), 'Android 工程中没有 Gradle Wrapper：' + wrapper);
  return {
    cwd: directory,
    apkDirectory: inside(directory, config.apkDirectory, 'APK 输出目录'),
    task,
    executable:
      platform === 'win32'
        ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/cmd.exe')
        : '/bin/sh',
    args:
      platform === 'win32'
        ? ['/d', '/s', '/c', `gradlew.bat ${task} --console=plain --no-daemon`]
        : [wrapper, task, '--console=plain', '--no-daemon'],
  };
}
function fastlanePlan(project, rule, variant, source, settings) {
  const config = androidConfig(project);
  if (variant !== 'release' || config.releaseRunner === 'gradle') return null;
  const cwd = inside(source, config.fastlaneDirectory, 'Fastlane 工作目录');
  const file = path.join(cwd, 'fastlane/Fastfile');
  if (config.releaseRunner === 'auto' && !fs.existsSync(file)) return null;
  assert(
    fs.existsSync(file),
    '所选分支没有 fastlane/Fastfile，请检查 Fastlane 工作目录或改用 Gradle',
  );
  const lane =
    rule.androidLane ||
    { test: 'build_test', staging: 'build_stage', gray: 'build_prod', stable: 'build_prod' }[
      rule.lane
    ];
  assert(lane && /^[A-Za-z_][A-Za-z0-9_]*$/.test(lane), '请在版本规则中填写 Android Fastlane lane');
  const gemfile = path.join(cwd, 'Gemfile');
  const bundled =
    config.fastlaneBundler === 'yes' ||
    (config.fastlaneBundler === 'auto' &&
      fs.existsSync(gemfile) &&
      /gem\s+["']fastlane["']/.test(fs.readFileSync(gemfile, 'utf8')));
  if (bundled) assert(fs.existsSync(gemfile), '使用 Bundler 需要在 Fastlane 工作目录提供 Gemfile');
  const tool = bundled ? 'bundle' : 'fastlane';
  const configured = settings[tool];
  if (configured) assert(path.isAbsolute(configured), tool + ' 路径必须是绝对路径');
  const name = process.platform === 'win32' ? tool + '.bat' : tool;
  const binary = executable(
    [
      configured,
      ...(process.env.PATH || '')
        .split(path.delimiter)
        .filter(Boolean)
        .map((dir) => path.join(dir, name)),
      '/opt/homebrew/bin/' + tool,
      '/opt/homebrew/opt/ruby/bin/' + tool,
      '/usr/local/bin/' + tool,
      path.join(os.homedir(), '.rbenv/shims', name),
      ...directories(path.join(os.homedir(), '.rbenv/versions')).map((dir) =>
        path.join(dir, 'bin', name),
      ),
    ],
    ' ' + tool,
  );
  const args = bundled ? ['exec', 'fastlane', 'android', lane] : ['android', lane];
  // cmd.exe is only needed for Windows Ruby .bat launchers; lane tokens were validated above.
  const command = commandForRuby(binary, args);
  const directory = inside(source, config.directory, 'Android 工程目录');
  return {
    ...command,
    cwd,
    apkDirectory: inside(directory, config.apkDirectory, 'APK 输出目录'),
    androidDirectory: directory,
    task: 'fastlane android ' + lane,
    bundled,
    binary,
  };
}
function commandForRuby(binary, args) {
  if (process.platform === 'win32' && /\.bat$/i.test(binary)) {
    assert(!/["%\r\n]/.test(binary), 'Ruby 工具路径包含不支持的字符');
    return {
      executable: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/cmd.exe'),
      args: ['/d', '/s', '/c', '""' + binary + '" ' + args.join(' ') + '"'],
    };
  }
  return { executable: binary, args };
}
function directories(root) {
  try {
    return fs
      .readdirSync(root)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((name) => path.join(root, name));
  } catch {
    return [];
  }
}
function executable(candidates, label) {
  for (const file of candidates.filter(Boolean)) {
    try {
      fs.accessSync(file, fs.constants.X_OK);
      if (fs.statSync(file).isFile()) return file;
    } catch {}
  }
  throw new Error(`未找到${label}，请在“服务与设置”填写路径`);
}
function sdkHome(settings, env = process.env, home = os.homedir()) {
  const sdk = [
    settings.androidSdk,
    env.ANDROID_HOME,
    env.ANDROID_SDK_ROOT,
    path.join(home, 'Library/Android/sdk'),
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Android/Sdk'),
    path.join(home, 'Android/Sdk'),
  ]
    .filter(Boolean)
    .find((file) => fs.existsSync(file));
  return sdk;
}
function resolveAdb(settings, env = process.env) {
  const sdk = sdkHome(settings, env);
  const name = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const configured = settings.adb && settings.adb !== 'adb' ? [settings.adb] : [];
  if (configured.length) assert(path.isAbsolute(configured[0]), 'adb 路径必须是绝对路径');
  return executable(
    [
      ...configured,
      sdk && path.join(sdk, 'platform-tools', name),
      ...(env.PATH || '')
        .split(path.delimiter)
        .filter(Boolean)
        .map((dir) => path.join(dir, name)),
    ],
    ' adb',
  );
}
function androidEnvironment(settings, node, env = process.env) {
  const sdk = sdkHome(settings, env);
  assert(sdk, '未找到 Android SDK，请在“服务与设置”填写 Android SDK 目录');
  const javaName = process.platform === 'win32' ? 'java.exe' : 'java';
  const homes = [
    settings.javaHome,
    env.JAVA_HOME,
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    env.ProgramFiles && path.join(env.ProgramFiles, 'Android/Android Studio/jbr'),
    ...directories('/Library/Java/JavaVirtualMachines').map((dir) =>
      path.join(dir, 'Contents/Home'),
    ),
    ...directories(path.join(os.homedir(), '.jdks')),
  ].filter(Boolean);
  const java = executable(
    homes.map((dir) => path.join(dir, 'bin', javaName)),
    ' JDK',
  );
  const javaHome = path.dirname(path.dirname(java));
  return {
    ...nodeEnvironment(node, env),
    JAVA_HOME: javaHome,
    ANDROID_HOME: sdk,
    ANDROID_SDK_ROOT: sdk,
    NODE_BINARY: node,
  };
}
function apkFiles(root) {
  const result = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && /\.apk$/i.test(entry.name) && !/-unsigned\.apk$/i.test(entry.name))
        result.push(file);
    }
  }
  walk(root);
  return result.sort(
    (a, b) => Number(/universal/i.test(b)) - Number(/universal/i.test(a)) || a.localeCompare(b),
  );
}
async function buildAndroidPackage({
  project,
  rule,
  variant,
  folder,
  node,
  settings,
  installWorker,
  workerExecutable,
  log,
  onSource = () => {},
  run = defaultRun,
}) {
  const git = (args) => run(settings.git || 'git', args, { cwd: project.path, onLog: log });
  androidConfig(project);
  const env = { ...androidEnvironment(settings, node), ENVFILE: rule.envFile };
  await run(
    path.join(env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'),
    ['-version'],
    { env, onLog: log },
  );
  await git(['fetch', 'origin', rule.branch]);
  const commit = await git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}']);
  assert(/^[a-f0-9]{40,64}$/.test(commit), '无法确定代码提交');
  fs.mkdirSync(folder, { recursive: true });
  const source = path.join(folder, 'source');
  let added = false;
  try {
    await git(['worktree', 'add', '--detach', source, commit]);
    added = true;
    onSource(commit);
    const fastlane = fastlanePlan(project, rule, variant, source, settings);
    const plan = fastlane || buildPlan(project, rule, variant, source);
    if (!fastlane)
      assert(
        fs.existsSync(inside(source, rule.envFile, '环境文件')),
        `发布代码中不存在 ${rule.envFile}`,
      );
    else log('使用 ' + fastlane.task + '；lane 内的环境文件与签名设置优先于外部 ENVFILE', 'info');
    const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
    await runBuildStage(
      '1/2 安装项目依赖',
      (onLog) =>
        run(
          workerExecutable,
          [installWorker, (pkg.packageManager || '').startsWith('yarn@') ? 'yarn' : 'npm'],
          { cwd: source, env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, onLog, timeout: 900000 },
        ),
      log,
    );
    if (fastlane) {
      env.PATH = path.dirname(fastlane.binary) + path.delimiter + env.PATH;
      env.FASTLANE_SKIP_UPDATE_CHECK = '1';
      env.FASTLANE_DISABLE_COLORS = '1';
      env.FASTLANE_SKIP_ACTION_SUMMARY = '1';
      env.CI = '1';
      if (fastlane.bundled) {
        const bundleEnv = {
          ...env,
          BUNDLE_FROZEN: fs.existsSync(path.join(fastlane.cwd, 'Gemfile.lock')) ? 'true' : 'false',
        };
        const bundle = commandForRuby(fastlane.binary, ['install']);
        await runBuildStage(
          '安装 Fastlane 依赖',
          (onLog) =>
            run(bundle.executable, bundle.args, {
              cwd: fastlane.cwd,
              env: bundleEnv,
              onLog,
              timeout: 900000,
            }),
          log,
        );
      }
    }
    await runBuildStage(
      `2/2 构建${variant === 'debug' ? '调试' : '正式'}安装包`,
      (onLog) => run(plan.executable, plan.args, { cwd: plan.cwd, env, onLog, timeout: 3600000 }),
      log,
    );
    // Gradle may create output directories during the build; re-check containment after it exits.
    inside(
      fastlane?.androidDirectory || plan.cwd,
      androidConfig(project).apkDirectory,
      'APK 输出目录',
    );
    const files = apkFiles(plan.apkDirectory);
    assert(
      files.length,
      '构建未生成可安装的 APK；请检查 Gradle 任务、输出目录及正式包签名配置（不接受 unsigned APK）',
    );
    const output = path.join(folder, 'apk');
    fs.mkdirSync(output, { recursive: true });
    const apks = files.map((file, index) => {
      const name = path.basename(file);
      const target = path.join(output, `${index + 1}-${name}`);
      fs.copyFileSync(file, target);
      return {
        id: crypto.randomUUID(),
        name,
        path: target,
        size: fs.statSync(target).size,
        sha256: sha(target),
      };
    });
    log(`安装包构建成功，共 ${apks.length} 个 APK；尚未安装到设备`, 'success');
    return { commit, task: plan.task, apks };
  } finally {
    if (added) {
      try {
        await git(['worktree', 'remove', '--force', source]);
      } catch (error) {
        log('临时构建目录清理失败：' + error.message, 'info');
      }
    }
  }
}
function parseDevices(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('List of devices') && !line.startsWith('*'))
    .flatMap((line) => {
      const [serial, state, ...parts] = line.split(/\s+/);
      if (!state || !['device', 'offline', 'unauthorized', 'no'].includes(state)) return [];
      return [
        {
          serial,
          state,
          model:
            parts
              .find((part) => part.startsWith('model:'))
              ?.slice(6)
              .replaceAll('_', ' ') || serial,
          emulator: /^emulator-\d+$/.test(serial),
        },
      ];
    });
}
async function listAndroidDevices(adb, log, run = defaultRun) {
  const devices = parseDevices(await run(adb, ['devices', '-l'], { onLog: log }));
  for (const device of devices.filter((item) => item.state === 'device' && !item.emulator)) {
    try {
      device.emulator =
        (
          await run(adb, ['-s', device.serial, 'shell', 'getprop', 'ro.kernel.qemu'], {
            onLog: log,
            timeout: 10000,
          })
        ).trim() === '1';
    } catch {}
  }
  return devices;
}
async function installAndroidApk({ build, apkId, serial, adb, log, run = defaultRun }) {
  assert(build.status === 'ready', '安装包尚未构建成功');
  const apk = build.apks.find((item) => item.id === apkId);
  assert(apk && fs.existsSync(apk.path), '安装包不存在，请重新构建');
  assert(sha(apk.path) === apk.sha256, '安装包文件已改变，请重新构建');
  const device = (await listAndroidDevices(adb, log, run)).find((item) => item.serial === serial);
  assert(
    device?.state === 'device' && device.emulator,
    '请选择已连接且可用的 Android 模拟器；离线或未授权设备不能安装',
  );
  let output = '';
  try {
    const result = await run(adb, ['-s', serial, 'install', '-r', apk.path], {
      onLog: (text, kind) => {
        if (kind !== 'command') output = (output + text).slice(-10000);
        log(text, kind);
      },
      timeout: 300000,
    });
    assert(
      /\bSuccess\b/.test(result) && !/Failure\s*\[/.test(result),
      result || 'adb 未确认安装成功',
    );
  } catch (error) {
    const detail = output || error.message;
    if (/INSTALL_FAILED_UPDATE_INCOMPATIBLE|signatures do not match/.test(detail))
      throw new Error(
        '安装失败：已有应用的签名不一致。请使用相同签名的包；工具不会自动卸载应用或删除数据。',
      );
    throw new Error('安装失败：' + detail);
  }
  log(`已安装 ${apk.name} → ${device.model} (${serial})`, 'success');
  return { apkId, serial, model: device.model, time: Date.now() };
}
module.exports = {
  defaults,
  androidConfig,
  flavorsIn,
  buildPlan,
  fastlanePlan,
  resolveAdb,
  androidEnvironment,
  apkFiles,
  buildAndroidPackage,
  parseDevices,
  listAndroidDevices,
  installAndroidApk,
};
