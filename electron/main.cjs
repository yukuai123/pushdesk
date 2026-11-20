const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  safeStorage,
  shell,
  screen,
  nativeTheme,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createTray } = require('./tray.cjs');
const {
  requiresConfirmation,
  quickRules,
  checkPublishConfirmation,
} = require('./release-policy.cjs');
const { Store } = require('./store.cjs');
const C = require('./core.cjs');
const { resolveNode, nodeEnvironment } = require('./runtime.cjs');
const { runBuildStage, appendLog } = require('./build-logs.cjs');
const {
  rememberVersions,
  updateVersion,
  invalidateVersionTasks,
  sameReleaseRule,
} = require('./versions.cjs');
const { platformConfig, historyKey } = require('./platforms.cjs');
const Android = require('./android-packages.cjs');
const { zipDir } = require('./artifacts.cjs');
const { createCodePushClient } = require('./codepush-client.cjs');
const { createHistoryClient } = require('./history-client.cjs');
let win,
  store,
  busy = false,
  activeTask = null;
let desktopTray,
  quitting = false;
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => {
  if (win && !win.isDestroyed()) showWindow();
});
const logs = [];
let secrets = [];
function log(text, kind = 'output', metadata = {}) {
  const row = {
    id: crypto.randomUUID(),
    time: Date.now(),
    text: C.redact(text, secrets),
    kind,
    ...metadata,
  };
  if (activeTask) appendLog(activeTask.logs, row);
  appendLog(logs, row);
  win?.webContents.send('pushdesk:event', { type: 'log', data: row });
}
function emit() {
  win?.webContents.send('pushdesk:event', { type: 'change' });
  desktopTray?.refresh();
}
const settings = () => store.get('settings', {});
const projects = () => store.get('projects', []);
function task(id) {
  const t = store.tasks().find((t) => t.id === id);
  C.assert(t, '任务不存在');
  return t;
}
function save(t) {
  const previous = store.tasks().find((task) => task.id === t.id);
  store.task(t);
  if (previous?.status !== t.status && ['confirmed', 'failed'].includes(t.status))
    desktopTray?.notify(
      t.status === 'confirmed' ? '发布成功' : '发布失败',
      `${t.projectName} · ${t.platform === 'ios' ? 'iOS' : 'Android'} · ${t.rule.target}${t.label ? ' · ' + t.label : ''}${t.error ? ' · ' + t.error.slice(0, 100) : ''}`,
      t.status === 'confirmed' ? 'success' : 'error',
    );
  emit();
  return t;
}
function getAndroidPackage(id) {
  const record = store.get('androidPackages', []).find((item) => item.id === id);
  C.assert(record, '安装包记录不存在');
  return record;
}
function saveAndroidPackage(record) {
  const records = store.get('androidPackages', []);
  store.put('androidPackages', [record, ...records.filter((item) => item.id !== record.id)]);
  emit();
  return record;
}
async function locked(fn) {
  C.assert(!busy, '已有任务正在执行，请等待完成');
  busy = true;
  emit();
  try {
    return await fn();
  } finally {
    activeTask = null;
    busy = false;
    emit();
  }
}
function token() {
  const v = store.get('token', null);
  C.assert(v, '请先在服务设置中填写并验证 Token');
  const t = safeStorage.decryptString(Buffer.from(v, 'base64'));
  secrets = [t];
  return t;
}
const sdk = createCodePushClient({
  settings,
  token,
  rememberToken: (key) => {
    secrets = [key];
  },
  log,
});

const queryHistory = createHistoryClient({ settings, token, log });
async function historyForApp(projectId, appName, deployment, platform = 'android') {
  const items = C.normalizeHistory(await queryHistory(appName, deployment));
  store.put('history:' + historyKey(projectId, deployment, platform), {
    items,
    time: Date.now(),
  });
  log(`已查询 ${platform === 'ios' ? 'iOS' : 'Android'} 的 ${items.length} 条发布记录`, 'success');
  emit();
  return items;
}
async function history(project, deployment, platform = 'android') {
  const config = platformConfig(project, platform);
  return historyForApp(project.id, config.app, deployment, platform);
}
function getProject(id) {
  const p = projects().find((p) => p.id === id);
  C.assert(p, '项目不存在');
  return p;
}
async function git(p, args) {
  return C.run(settings().git || 'git', args, { cwd: p.path, onLog: log });
}
function showWindow(taskToOpen) {
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (taskToOpen?.id)
    win.webContents.send('pushdesk:event', {
      type: 'openTask',
      data: taskToOpen,
    });
}
async function prepareNode() {
  const configured = settings().node || 'node';
  const runtime = await resolveNode(configured);
  if (configured !== runtime.executable) {
    store.put('settings', { ...settings(), node: runtime.executable });
    log('自动定位 Node.js：' + runtime.executable + ' (' + runtime.version + ')', 'success');
  }
  return runtime;
}
const handlers = {
  setTheme: (mode) => {
    C.assert(['light', 'dark'].includes(mode), '主题无效');
    nativeTheme.themeSource = mode;
    const background = mode === 'dark' ? '#19212c' : '#fafbfc';
    win.setBackgroundColor(background);
    if (process.platform === 'win32')
      win.setTitleBarOverlay({
        color: background,
        symbolColor: mode === 'dark' ? '#e1e8f2' : '#202c3b',
        height: 34,
      });
  },
  snapshot: () => ({
    projects: projects(),
    settings: settings(),
    hasToken: !!store.get('token', null),
    tasks: store.tasks(),
    androidPackages: store.get('androidPackages', []),
    logs,
    busy,
    histories: Object.fromEntries(
      projects().flatMap((project) =>
        (project.ios?.enabled ? ['android', 'ios'] : ['android']).flatMap((platform) =>
          [
            ...new Set([
              'Production',
              'Staging',
              'Deployment',
              ...project.rules.map((rule) => rule.deployment),
            ]),
          ].map((deployment) => {
            const key = historyKey(project.id, deployment, platform);
            return [key, store.get('history:' + key, null)];
          }),
        ),
      ),
    ),
  }),
  saveProject: (p) =>
    locked(async () => {
      C.validateProject(p);
      Android.androidConfig(p);
      if (p.ios?.enabled) platformConfig(p, 'ios');
      C.assert(fs.existsSync(path.join(p.path, 'package.json')), '目录中没有 package.json');
      await git(p, ['rev-parse', '--show-toplevel']);
      const list = projects();
      p = {
        ...p,
        id: p.id || crypto.randomUUID(),
        rules: p.rules.map((r) => ({ ...r, id: r.id || crypto.randomUUID() })),
      };
      const previous = list.find((item) => item.id === p.id);
      p = rememberVersions(previous, p);
      store.put('projects', [...list.filter((x) => x.id !== p.id), p]);
      if (previous)
        for (const task of invalidateVersionTasks(store.tasks(), p.id, previous, p)) save(task);
      emit();
      return p;
    }),
  updateVersion: (input) =>
    locked(async () => {
      const previous = getProject(input.projectId);
      const next = updateVersion(previous, input);
      store.put(
        'projects',
        projects().map((project) => (project.id === next.id ? next : project)),
      );
      for (const task of invalidateVersionTasks(store.tasks(), next.id, previous, next)) save(task);
      const before = previous.rules.find((rule) => rule.id === input.ruleId);
      const after = next.rules.find((rule) => rule.id === input.ruleId);
      log(
        `已同步发布配置 ${before.target} + ${before.branch} → ${after.target} + ${after.branch}${after.tag ? ' · ' + after.tag : ''}，后续命令和构建读取新配置。`,
        'success',
      );
      emit();
      return next;
    }),
  removeProject: (id) =>
    locked(async () => {
      C.assert(
        !store.tasks().some((t) => t.projectId === id && ['ready', 'unknown'].includes(t.status)),
        '请先处理待发布或结果未知的任务',
      );
      store.put(
        'projects',
        projects().filter((x) => x.id !== id),
      );
      emit();
    }),
  saveSettings: (s) =>
    locked(async () => {
      const u = new URL(s.url);
      C.assert(
        u.protocol === 'https:' ||
          (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)),
        '服务必须使用 HTTPS',
      );
      const runtime = await resolveNode(s.node || 'node');
      const old = settings();
      if (old.url !== s.url) store.put('token', null);
      store.put('settings', {
        url: s.url.replace(/\/$/, ''),
        node: runtime.executable,
        git: s.git || 'git',
        androidSdk: (s.androidSdk || '').trim(),
        javaHome: (s.javaHome || '').trim(),
        adb: (s.adb || '').trim(),
        fastlane: (s.fastlane || '').trim(),
        bundle: (s.bundle || '').trim(),
      });
      emit();
    }),
  authenticate: ({ value }) =>
    locked(async () => {
      C.assert(value?.trim(), '请输入 Token');
      C.assert(safeStorage.isEncryptionAvailable(), '系统安全存储不可用');
      log('$ code-push login ' + settings().url + ' --accessKey ••••••', 'command');
      const ok = await sdk('isAuthenticated', [true], {
        url: settings().url,
        token: value.trim(),
      });
      C.assert(ok, 'Token 验证失败');
      store.put('token', safeStorage.encryptString(value.trim()).toString('base64'));
      log('鉴权成功，Token 已加密保存', 'success');
      emit();
    }),
  apps: async () => {
    log('$ code-push app ls --format json', 'command');
    return sdk('getApps');
  },
  history: async ({ projectId, deployment, platform = 'android' }) =>
    history(getProject(projectId), deployment, platform),
  inspect: async ({ projectId }) => {
    const p = getProject(projectId);
    const runtime = await prepareNode();
    log('Node.js ' + runtime.version + ' · ' + runtime.executable, 'success');
    return {
      branch: await git(p, ['branch', '--show-current']),
      status: await git(p, ['status', '--short']),
      node: runtime.version,
    };
  },
  prepare: async (input) => {
    const built = await locked(async () => {
      const p = getProject(input.projectId),
        r = p.rules.find((r) => r.id === input.ruleId);
      C.assert(r, '请选择发布配置');
      const config = platformConfig(p, input.platform || 'android');
      C.assert(
        !store.tasks().some((t) => t.projectId === p.id && ['ready', 'unknown'].includes(t.status)),
        '该项目有待发布或结果未知任务，请先处理',
      );
      const t = {
        id: crypto.randomUUID(),
        projectId: p.id,
        projectName: p.name,
        app: config.app,
        platform: config.platform,
        build: config.build,
        rule: { ...r },
        server: settings().url,
        description: typeof input.description === 'string' ? input.description.trim() : '',
        mandatory: !!input.mandatory,
        status: 'building',
        createdAt: Date.now(),
        logs: [],
      };
      activeTask = t;
      save(t);
      try {
        const runtime = await prepareNode();
        const h = await history(p, r.deployment, config.platform);
        C.checkServerConflicts(p, r, h);
        await git(p, ['fetch', 'origin', r.branch]);
        t.commit = await git(p, ['rev-parse', '--verify', 'FETCH_HEAD^{commit}']);
        C.assert(/^[a-f0-9]{40,64}$/.test(t.commit), '无法确定代码提交');
        t.folder = path.join(app.getPath('userData'), 'artifacts', t.id);
        fs.mkdirSync(t.folder, { recursive: true });
        t.worktree = path.join(t.folder, 'source');
        await git(p, ['worktree', 'add', '--detach', t.worktree, t.commit]);
        C.assert(
          fs.existsSync(path.join(t.worktree, r.envFile)),
          `发布代码中不存在 ${r.envFile}，请将非敏感构建配置纳入版本管理后重试`,
        );
        const node = runtime.executable;
        const env = { ...nodeEnvironment(node), ENVFILE: r.envFile };
        const installScript = path.join(__dirname, 'install-worker.cjs');
        const pkg = JSON.parse(fs.readFileSync(path.join(t.worktree, 'package.json'), 'utf8'));
        const manager = pkg.packageManager || '';
        await runBuildStage(
          '1/2 安装项目依赖',
          (onLog) =>
            C.run(process.execPath, [installScript, manager.startsWith('yarn@') ? 'yarn' : 'npm'], {
              cwd: t.worktree,
              env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
              onLog,
              timeout: 900000,
            }),
          log,
        );
        const buildInput = path.join(t.folder, 'build.json');
        fs.writeFileSync(
          buildInput,
          JSON.stringify({
            cwd: t.worktree,
            output: path.join(t.folder, 'bundle'),
            platform: t.platform,
            nodeExecutable: node,
            build: t.build,
          }),
        );
        log(
          `构建使用 code-push release-react 的 ${t.platform} bundle / Hermes 适配器；此阶段不上传`,
          'info',
        );
        await runBuildStage(
          `2/2 构建 ${t.platform === 'ios' ? 'iOS' : 'Android'} 热更新`,
          (onLog) =>
            C.run(process.execPath, [path.join(__dirname, 'build-worker.cjs'), buildInput], {
              cwd: t.worktree,
              env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
              onLog,
              timeout: 900000,
            }),
          log,
        );
        t.artifact = path.join(t.folder, 'update.zip');
        await zipDir(path.join(t.folder, 'bundle', 'CodePush'), t.artifact);
        t.sha256 = C.sha(t.artifact);
        t.size = fs.statSync(t.artifact).size;
        t.status = 'ready';
        t.baseline = h.map((x) => x.label).join(',');
        log(
          `构建成功，${requiresConfirmation(t.rule) ? '等待二次确认' : '即将按配置直接发布'}。SHA256 ${t.sha256}`,
          'success',
        );
        save(t);
        return t;
      } catch (e) {
        t.status = 'failed';
        t.error = C.redact(e.message, secrets);
        save(t);
        throw e;
      }
    });
    return requiresConfirmation(built.rule)
      ? built
      : handlers.publish({ id: built.id, automatic: true });
  },
  publish: ({ id, confirmation, automatic = false }) =>
    locked(async () => {
      const t = task(id);
      activeTask = t;
      C.assert(t.status === 'ready', '任务不是待确认状态');

      C.assert(t.server === settings().url, '服务地址已改变，请重新构建');
      C.assert(C.sha(t.artifact) === t.sha256, '产物哈希改变，请重新构建');
      const p = getProject(t.projectId);
      const currentRule = p.rules.find((rule) => rule.id === t.rule.id);
      C.assert(currentRule, '发布配置不存在');
      checkPublishConfirmation(t, currentRule, { automatic, confirmation });
      const config = platformConfig(p, t.platform || 'android');
      C.assert(
        sameReleaseRule(
          p.rules.find((r) => r.id === t.rule.id),
          t.rule,
        ) &&
          config.app === t.app &&
          (!t.build || JSON.stringify(config.build) === JSON.stringify(t.build)),
        '发布配置已改变，请重新构建',
      );
      const h = await history(p, t.rule.deployment, t.platform || 'android');
      C.checkServerConflicts(p, t.rule, h);
      C.assert(
        h.map((x) => x.label).join(',') === t.baseline,
        '线上历史已改变，请放弃当前任务并重新准备发布',
      );
      t.status = 'uploading';
      save(t);
      const description = t.description + `\n[PushDesk:${t.id}]`;
      log(
        '$ ' +
          C.displayCommand('code-push', [
            'release',
            t.app,
            t.artifact,
            t.rule.target,
            '--deploymentName',
            t.rule.deployment,
            '--mandatory',
            String(t.mandatory),
            '--description',
            description,
          ]),
        'command',
      );
      try {
        await sdk('release', [
          t.app,
          t.rule.deployment,
          t.artifact,
          t.rule.target,
          {
            description,
            isMandatory: t.mandatory,
            isDisabled: false,
            rollout: 100,
          },
        ]);
        t.status = 'unknown';
        save(t);
        return await handlers.reconcile(t.id);
      } catch (e) {
        t.status = 'unknown';
        t.error = C.redact(e.message, secrets);
        save(t);
        log('发布结果尚未确认，请点击回查结果；不会自动重复上传', 'error');
        throw e;
      }
    }),
  reconcile: async (id) => {
    const t = task(id);
    C.assert(['unknown', 'uploading'].includes(t.status), '该任务无需回查');
    C.assert(t.server === settings().url, '请恢复任务原服务地址后回查');
    const h = await historyForApp(t.projectId, t.app, t.rule.deployment, t.platform || 'android');
    const match = h.find((x) => x.description.includes(`[PushDesk:${id}]`));
    if (match) {
      t.status = 'confirmed';
      t.label = match.label;
      t.error = '';
      log('服务端已确认发布 ' + match.label, 'success');
    } else log('服务端未找到该任务，结果仍未知，请稍后回查或人工核实', 'info');
    return save(t);
  },
  discard: (id) =>
    locked(async () => {
      const t = task(id);
      C.assert(
        ['ready', 'failed', 'building', 'outdated'].includes(t.status),
        '结果未知的发布不能直接丢弃，请先回查',
      );
      t.status = 'discarded';
      save(t);
      if (t.worktree && fs.existsSync(t.worktree))
        await git(getProject(t.projectId), ['worktree', 'remove', '--force', t.worktree]);
      return t;
    }),
  buildAndroidPackage: (input) =>
    locked(async () => {
      const project = getProject(input.projectId);
      C.validateProject(project);
      const rule = project.rules.find((rule) => rule.id === input.ruleId);
      C.assert(rule, '版本配置不存在');
      C.assert(['debug', 'release'].includes(input.variant), '请选择调试包或正式包');
      const record = {
        id: crypto.randomUUID(),
        projectId: project.id,
        projectName: project.name,
        variant: input.variant,
        rule: { ...rule },
        status: 'building',
        createdAt: Date.now(),
        folder: '',
        apks: [],
        logs: [],
      };
      record.folder = path.join(app.getPath('userData'), 'android-packages', record.id);
      activeTask = record;
      saveAndroidPackage(record);
      try {
        const runtime = await prepareNode();
        Object.assign(
          record,
          await Android.buildAndroidPackage({
            project,
            rule,
            variant: input.variant,
            folder: record.folder,
            node: runtime.executable,
            settings: settings(),
            log,
            installWorker: path.join(__dirname, 'install-worker.cjs'),
            workerExecutable: process.execPath,
            onSource: (commit) => {
              record.commit = commit;
              saveAndroidPackage(record);
            },
          }),
        );
        record.status = 'ready';
        desktopTray?.notify(
          '安装包构建成功',
          project.name +
            ' · ' +
            (input.variant === 'debug' ? '调试包' : '正式包') +
            '，可手动选择安装',
          'success',
        );
        return saveAndroidPackage(record);
      } catch (error) {
        record.status = 'failed';
        record.error = C.redact(error.message, secrets);
        saveAndroidPackage(record);
        desktopTray?.notify(
          '安装包构建失败',
          project.name + ' · ' + record.error.slice(0, 100),
          'error',
        );
        throw error;
      }
    }),
  listAndroidDevices: () => Android.listAndroidDevices(Android.resolveAdb(settings()), log),
  installAndroidApk: (input) =>
    locked(async () => {
      const record = getAndroidPackage(input.buildId);
      activeTask = record;
      try {
        const installed = await Android.installAndroidApk({
          build: record,
          apkId: input.apkId,
          serial: input.serial,
          adb: Android.resolveAdb(settings()),
          log,
        });
        record.installations = [...(record.installations || []), installed];
        desktopTray?.notify('安装成功', installed.model + ' · ' + installed.serial, 'success');
        return installed;
      } finally {
        saveAndroidPackage(record);
      }
    }),
  importAndroidApk: ({ projectId }) =>
    locked(async () => {
      const project = getProject(projectId);
      const selected = await dialog.showOpenDialog(win, {
        title: '选择 Android 安装包',
        properties: ['openFile'],
        filters: [{ name: 'Android 安装包', extensions: ['apk'] }],
      });
      if (selected.canceled || !selected.filePaths[0]) return null;
      const file = selected.filePaths[0];
      C.assert(/\.apk$/i.test(file) && fs.statSync(file).isFile(), '请选择 APK 文件');
      const id = crypto.randomUUID();
      const folder = path.join(app.getPath('userData'), 'android-packages', id);
      fs.mkdirSync(folder, { recursive: true });
      const target = path.join(folder, path.basename(file));
      fs.copyFileSync(file, target);
      const record = {
        id,
        projectId: project.id,
        projectName: project.name,
        variant: 'imported',
        status: 'ready',
        createdAt: Date.now(),
        folder,
        logs: [],
        apks: [
          {
            id: crypto.randomUUID(),
            name: path.basename(file),
            path: target,
            size: fs.statSync(target).size,
            sha256: C.sha(target),
          },
        ],
      };
      log('已选择本地 APK：' + path.basename(file) + '；尚未安装', 'info');
      return saveAndroidPackage(record);
    }),
  openAndroidPackageFolder: (id) => shell.openPath(getAndroidPackage(id).folder),
  pickDirectory: async () => {
    const r = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });
    return r.canceled ? null : r.filePaths[0];
  },
  pickFile: async () => {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'] });
    return r.canceled ? null : r.filePaths[0];
  },
  openTaskFolder: (id) => {
    const t = task(id);
    if (t.folder) return shell.openPath(t.folder);
  },
};
app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('com.pushdesk.desktop');
  store = await new Store().init(app.getPath('userData'));
  if (!store.get('settings', null))
    store.put('settings', {
      url: 'https://code-push-server.tastientech.com',
      node: process.env.NVM_BIN ? path.join(process.env.NVM_BIN, 'node') : 'node',
      git: 'git',
    });
  for (const record of store.get('androidPackages', [])) {
    if (record.status === 'building')
      saveAndroidPackage({
        ...record,
        status: 'failed',
        error: '上次安装包构建被中断，请重新构建',
      });
  }
  for (const t of store.tasks()) {
    if (t.status === 'uploading') save({ ...t, status: 'unknown' });
    if (t.status === 'building')
      save({ ...t, status: 'failed', error: '上次构建被中断，请重新准备' });
  }
  for (const [name, fn] of Object.entries(handlers))
    ipcMain.handle('pushdesk:' + name, async (e, arg) => {
      C.assert(e.sender === win.webContents, '非法调用');
      try {
        return { ok: true, data: await fn(arg) };
      } catch (err) {
        const message = C.redact(err.message, secrets);
        log(message, 'error');
        return { ok: false, error: message, status: err.status };
      }
    });
  const { width: availableWidth, height: availableHeight } = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  ).workAreaSize;
  win = new BrowserWindow({
    width: Math.min(1280, availableWidth),
    height: Math.min(820, availableHeight),
    minWidth: Math.min(900, availableWidth),
    minHeight: Math.min(580, availableHeight),
    title: 'PushDesk',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#19212c' : '#fafbfc',
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 14, y: 10 } }
      : {
          titleBarOverlay: {
            color: '#fafbfc',
            symbolColor: '#202c3b',
            height: 34,
          },
        }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault();
  });
  win.on('minimize', (event) => {
    event.preventDefault();
    win.hide();
  });
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });
  desktopTray = createTray({
    projects,
    isBusy: () => busy,
    pending: () => store.tasks().filter((task) => ['ready', 'unknown'].includes(task.status)),
    show: showWindow,
    quit: () => {
      quitting = true;
      app.quit();
    },
    emit: (event) => win.webContents.send('pushdesk:event', event),
    quick: async (input) => {
      try {
        C.assert(!busy, '已有发布任务执行中');
        const project = getProject(input.projectId);
        C.assert(
          quickRules(project).some((rule) => rule.id === input.ruleId),
          '仅允许快捷发布测试或预发布',
        );
        desktopTray.notify(
          '开始快捷发布',
          project.name + ' · ' + (input.platform === 'ios' ? 'iOS' : 'Android'),
        );
        const result = await handlers.prepare(input);
        if (result.status === 'ready') {
          showWindow(result);
          desktopTray.notify('请确认发布', result.projectName + ' · ' + result.rule.target);
        } else if (result.status === 'unknown')
          desktopTray.notify(
            '发布结果待回查',
            result.projectName + ' · ' + result.rule.target,
            'warning',
          );
      } catch (error) {
        log(C.redact(error.message, secrets), 'error');
        desktopTray.notify('快捷发布未完成', C.redact(error.message, secrets), 'error');
      }
    },
  });
  if (process.env.PUSHDESK_DEV_URL) await win.loadURL(process.env.PUSHDESK_DEV_URL);
  else await win.loadFile(path.join(__dirname, '../dist/index.html'));
});
app.on('activate', () => {
  if (win && !win.isDestroyed()) showWindow();
});
app.on('before-quit', (event) => {
  if (busy) {
    event.preventDefault();
    quitting = false;
    desktopTray?.notify('任务执行中', '请等待当前任务结束后退出', 'warning');
  } else {
    quitting = true;
    desktopTray?.destroy();
  }
});
app.on('window-all-closed', () => {
  if (quitting) app.quit();
});
