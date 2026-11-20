const { Tray, Menu, nativeImage, Notification } = require('electron');
const { quickRules } = require('./release-policy.cjs');
function trayIcon() {
  const side = 20,
    pixels = Buffer.alloc(side * side * 4);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const line =
        (y >= 4 && y <= 6 && x >= 3 && x <= 16) ||
        (y >= 9 && y <= 11 && x >= 5 && x <= 14) ||
        (y >= 14 && y <= 16 && x >= 7 && x <= 12);
      if (line) {
        const i = (y * side + x) * 4;
        pixels[i] = process.platform === 'darwin' ? 0 : 74;
        pixels[i + 1] = process.platform === 'darwin' ? 0 : 110;
        pixels[i + 2] = process.platform === 'darwin' ? 0 : 230;
        pixels[i + 3] = 255;
      }
    }
  const icon = nativeImage.createFromBitmap(pixels, { width: side, height: side, scaleFactor: 1 });
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  return icon;
}
function createTray({ projects, isBusy, show, quick, quit, pending, emit }) {
  const tray = new Tray(trayIcon());
  let recent = '尚无快捷发布';
  function notify(title, body, status = 'info') {
    recent = title + ' · ' + body;
    emit({ type: 'feedback', data: { title, body, status } });
    try {
      if (Notification.isSupported()) {
        const notice = new Notification({ title, body });
        notice.on('click', show);
        notice.show();
      }
    } catch {
      /* System notifications may be disabled; in-app feedback remains available. */
    }
    refresh();
  }
  function refresh() {
    const menu = [{ label: '打开 PushDesk', click: show }, { type: 'separator' }];
    for (const project of projects()) {
      const rules = quickRules(project);
      if (!rules.length) continue;
      const platforms = project.ios?.enabled ? ['android', 'ios'] : ['android'];
      menu.push({
        label: project.name,
        submenu: platforms.map((platform) => ({
          label: platform === 'ios' ? 'iOS' : 'Android',
          submenu: rules.map((rule) => ({
            label: `${rule.lane === 'test' ? '测试' : '预发布'} · ${rule.target}${rule.tag ? ' · ' + rule.tag : ''}`,
            enabled: !isBusy(),
            click: () =>
              quick({
                projectId: project.id,
                ruleId: rule.id,
                platform,
                mandatory: true,
                description: '',
              }),
          })),
        })),
      });
    }
    const ready = pending();
    if (ready.length)
      menu.push({
        label: `待处理任务 (${ready.length})`,
        submenu: ready.map((task) => ({
          label: `${task.projectName} · ${task.rule.target}`,
          click: () => show(task),
        })),
      });
    menu.push(
      { type: 'separator' },
      { label: isBusy() ? '正在执行发布任务…' : recent.slice(0, 90), enabled: false },
      { label: '退出', enabled: !isBusy(), click: quit },
    );
    tray.setToolTip(isBusy() ? 'PushDesk · 正在执行任务' : 'PushDesk · 测试 / 预发布快捷发布');
    tray.setContextMenu(Menu.buildFromTemplate(menu));
  }
  tray.on('double-click', () => show());
  if (process.platform === 'darwin') tray.on('click', () => tray.popUpContextMenu());
  refresh();
  return { refresh, notify, destroy: () => tray.destroy() };
}
module.exports = { createTray };
