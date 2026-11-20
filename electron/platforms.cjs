const path = require('node:path');
const { assert } = require('./core.cjs');

function validateRelativeFile(value, label) {
  assert(
    typeof value === 'string' &&
      !path.isAbsolute(value) &&
      !path.win32.isAbsolute(value) &&
      !value.split(/[\\/]/).includes('..') &&
      !/[\x00-\x1f]/.test(value),
    `${label}必须是项目内的相对路径`,
  );
}
function platformConfig(project, platform = 'android') {
  assert(platform === 'android' || platform === 'ios', '不支持的发布平台');
  if (platform === 'android') {
    return {
      platform,
      app: project.app,
      build: { entryFile: '', bundleName: 'index.android.bundle', podFile: '', hermes: 'auto' },
    };
  }
  assert(project.ios?.enabled === true, '该项目尚未启用 iOS 热更新');
  const app = project.ios.app;
  assert(
    typeof app === 'string' && app.trim() && !app.startsWith('-'),
    '请填写 iOS CodePush 应用名',
  );
  assert(app !== project.app, 'iOS 与 Android 必须使用不同的 CodePush 应用，避免混发更新包');
  const build = {
    entryFile: '',
    bundleName: 'main.jsbundle',
    podFile: 'ios/Podfile',
    hermes: 'auto',
    ...project.ios.build,
  };
  validateRelativeFile(build.entryFile, 'iOS 入口文件');
  validateRelativeFile(build.podFile, 'Podfile');
  assert(
    typeof build.bundleName === 'string' &&
      build.bundleName &&
      !/[\\/\x00-\x1f]/.test(build.bundleName) &&
      !['.', '..'].includes(build.bundleName),
    'iOS Bundle 名称只能是文件名',
  );
  assert(['auto', 'enabled', 'disabled'].includes(build.hermes), 'Hermes 配置无效');
  return { platform, app, build };
}
function historyKey(projectId, deployment, platform = 'android') {
  return platform === 'android' ? `${projectId}:${deployment}` : `${projectId}:ios:${deployment}`;
}
module.exports = { platformConfig, historyKey, validateRelativeFile };
