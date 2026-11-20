const fs = require('node:fs');
const path = require('node:path');
const { assert } = require('./core.cjs');
const { validateRelativeFile } = require('./platforms.cjs');

function projectFile(cwd, relative) {
  validateRelativeFile(relative, '构建文件');
  const full = path.resolve(cwd, relative);
  assert(fs.existsSync(full) && fs.statSync(full).isFile(), `发布代码中不存在文件 ${relative}`);
  const actual = path.relative(fs.realpathSync(cwd), fs.realpathSync(full));
  assert(
    actual !== '..' && !actual.startsWith('..' + path.sep) && !path.isAbsolute(actual),
    '构建文件不能指向项目目录之外',
  );
  return full;
}
async function usesHermes(cwd, platform, build, utils) {
  if (build.hermes !== 'auto') return build.hermes === 'enabled';
  if (platform === 'android') return utils.getHermesEnabled(null);
  // Delegate to the installed CLI so a normal release-react command keeps its defaults.
  const podFile = projectFile(cwd, build.podFile || 'ios/Podfile');
  return utils.getiOSHermesEnabled(podFile);
}
async function buildBundle(input, utils) {
  const { cwd, output, platform = 'android' } = input;
  assert(['android', 'ios'].includes(platform), '不支持的构建平台');
  const build = {
    entryFile: '',
    bundleName: platform === 'ios' ? 'main.jsbundle' : 'index.android.bundle',
    podFile: 'ios/Podfile',
    hermes: 'auto',
    ...input.build,
  };
  const entry =
    build.entryFile ||
    (fs.existsSync(path.join(cwd, `index.${platform}.js`)) ? `index.${platform}.js` : 'index.js');
  projectFile(cwd, entry);
  const hermes = await usesHermes(cwd, platform, build, utils);
  const folder = path.join(output, 'CodePush');
  fs.mkdirSync(folder, { recursive: true });
  console.log(
    `构建平台：${platform === 'ios' ? 'iOS' : 'Android'}，入口：${entry}，Hermes：${hermes ? '启用' : '关闭'}`,
  );
  await utils.runReactNativeBundleCommand(
    build.bundleName,
    false,
    entry,
    folder,
    platform,
    null,
    null,
    ['--reset-cache'],
  );
  if (hermes) await utils.runHermesEmitBinaryCommand(build.bundleName, folder, null, []);
  return folder;
}
module.exports = { buildBundle, usesHermes };
