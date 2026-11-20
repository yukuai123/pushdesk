const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

// Render the real TSX component without launching Electron or executing build commands.
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, file) => {
    const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    });
    module._compile(output.outputText, file);
  };
}
global.window = {};
const { Publish } = require('../src/pages/Publish.tsx');

test('发布表单允许说明为空，默认勾选强制更新', () => {
  const html = renderToStaticMarkup(
    React.createElement(Publish, {
      project: {
        id: 'demo',
        name: '测试项目',
        path: '/tmp/demo',
        app: 'demo-android',
        rules: [
          {
            id: 'test',
            lane: 'test',
            branch: 'test',
            deployment: 'Deployment',
            target: '1.0.2',
            envFile: '.env.test',
          },
        ],
      },
      busy: false,
      onPrepare: () => {
        throw new Error('渲染表单不应发起构建');
      },
    }),
  );
  assert.match(html, /更新说明（选填）/);
  const textarea = html.match(/<textarea\b[^>]*>/)[0];
  assert.doesNotMatch(textarea, /\brequired\b/);
  const checkbox = html.match(/<input\b[^>]*type="checkbox"[^>]*>/)[0];
  assert.match(checkbox, /\bchecked=""/);
});

const { Overview } = require('../src/pages/Overview.tsx');
const { ProjectModal } = require('../src/components/ProjectModal.tsx');
const dualProject = {
  id: 'dual',
  name: '双端项目',
  path: '/tmp/dual',
  app: 'dual-android',
  ios: {
    enabled: true,
    app: 'dual-ios',
    build: {
      entryFile: '',
      bundleName: 'main.jsbundle',
      podFile: 'ios/Podfile',
      hermes: 'disabled',
    },
  },
  rules: [
    {
      id: 'stable',
      lane: 'stable',
      branch: 'master',
      deployment: 'Production',
      target: '1.0.2',
      envFile: '.env.production',
    },
  ],
};

test('iOS 发布表单和项目配置展示独立应用与构建设置', () => {
  const html = renderToStaticMarkup(
    React.createElement(Publish, {
      project: dualProject,
      platform: 'ios',
      busy: false,
      onPrepare: () => {},
    }),
  );
  assert.match(html, /准备 iOS 发布/);
  assert.match(html, /dual-ios/);
  assert.doesNotMatch(html, /dual-android/);
  const editor = renderToStaticMarkup(
    React.createElement(ProjectModal, {
      project: dualProject,
      busy: false,
      close: () => {},
      onSave: () => {},
      onDelete: () => {},
    }),
  );
  assert.match(editor, /启用 iOS 热更新/);
  assert.match(editor, /value="dual-ios"/);

  assert.match(editor, /高级构建设置（通常无需修改）/);
  assert.doesNotMatch(editor, /value="main.jsbundle"/);
});
test('iOS 总览不会读取 Android 的发布历史', () => {
  const state = {
    histories: {
      'dual:Production': {
        items: [
          {
            label: 'v-android',
            appVersion: '1.0.2',
            description: 'Android专属更新',
            uploadTime: 1,
            rollout: 100,
          },
        ],
      },
      'dual:ios:Production': {
        items: [
          {
            label: 'v-ios',
            appVersion: '1.0.2',
            description: 'iOS专属更新',
            uploadTime: 2,
            rollout: 100,
          },
        ],
      },
    },
  };
  const html = renderToStaticMarkup(
    React.createElement(Overview, {
      project: dualProject,
      platform: 'ios',
      state,
      filter: '',
      setFilter: () => {},
      laneFilter: 'all',
      setLaneFilter: () => {},
      busy: false,
      onRefresh: () => {},
      onEdit: () => {},
      onPublish: () => {},
    }),
  );
  assert.match(html, /iOS专属更新/);
  assert.doesNotMatch(html, /Android专属更新/);
});

const { releaseCommand } = require('../src/versions.ts');
const { updateVersion } = require('../electron/versions.cjs');
test('线上版本保存后，工作台直接选中该版本且双端命令使用新版本', () => {
  const next = updateVersion(dualProject, {
    ruleId: 'stable',
    expectedTarget: '1.0.2',
    target: '1.0.6',
    tag: '验收包',
  });
  for (const platform of ['android', 'ios']) {
    const command = releaseCommand(next, next.rules[0], platform);
    assert.match(command, /-t 1\.0\.6/);
    assert.doesNotMatch(command, /-t 1\.0\.2/);
    const html = renderToStaticMarkup(
      React.createElement(Publish, {
        project: next,
        platform,
        initialRuleId: 'stable',
        busy: false,
        onPrepare: () => {},
      }),
    );
    assert.match(html, /1\.0\.6/);
    assert.match(html, /验收包/);
  }
});
test('服务端历史只显示当前部署目标，不合并其他部署缓存', () => {
  const state = {
    histories: {
      'dual:Production': {
        time: 1,
        items: [
          {
            label: 'v-prod',
            appVersion: '1.0.2',
            description: '生产唯一记录',
            uploadTime: 1,
            rollout: 100,
          },
        ],
      },
      'dual:Staging': {
        time: 2,
        items: [
          {
            label: 'v-stage',
            appVersion: '1.0.6',
            description: '预发布唯一记录',
            uploadTime: 2,
            rollout: 100,
          },
        ],
      },
    },
  };
  const html = renderToStaticMarkup(
    React.createElement(Overview, {
      project: dualProject,
      platform: 'android',
      deployment: 'Staging',
      state,
      filter: '',
      setFilter: () => {},
      laneFilter: 'all',
      setLaneFilter: () => {},
      busy: false,
      onRefresh: () => {},
      onEdit: () => {},
      onPublish: () => {},
    }),
  );
  assert.match(html, /预发布唯一记录/);
  assert.doesNotMatch(html, /生产唯一记录/);
});

test('同版本不同分支的历史标签不串用，卡片区分分支最近发布与包当前更新', () => {
  const { versionRecords, sourceBranch } = require('../src/versions.ts');
  const { ReleaseVersionCard } = require('../src/components/ReleaseVersionCard.tsx');
  const project = {
    ...dualProject,
    rules: [
      dualProject.rules[0],
      { ...dualProject.rules[0], id: 'gray', lane: 'gray', branch: 'gray', tag: '灰度标签' },
    ],
  };
  assert.equal(versionRecords(project).length, 2);
  const tasks = project.rules.map((rule, index) => ({
    id: 'task' + index,
    projectId: 'dual',
    app: 'dual-android',
    platform: 'android',
    rule,
  }));
  const items = tasks.map((task, index) => ({
    label: 'v' + index,
    appVersion: '1.0.2',
    description: '[PushDesk:' + task.id + ']',
    uploadTime: index + 1,
    rollout: 100,
  }));
  assert.equal(
    sourceBranch(items[0], tasks, {
      projectId: 'dual',
      platform: 'android',
      deployment: 'Production',
      app: 'dual-android',
    }),
    'master',
  );
  assert.equal(
    sourceBranch(items[0], tasks, { projectId: 'dual', platform: 'ios', deployment: 'Production' }),
    undefined,
  );
  const html = renderToStaticMarkup(
    React.createElement(ReleaseVersionCard, {
      projectId: 'dual',
      app: 'dual-android',
      rule: project.rules[0],
      tasks,
      cache: { items, time: 1 },
      busy: false,
      onSave: async () => {},
      onPublish: () => {},
    }),
  );
  assert.match(html, /该分支最近发布，非包当前更新/);
  assert.match(html, /v0/);
  assert.doesNotMatch(html, />v1<\/span>/);
});

test('终端默认折叠安装和构建输出，命令与其他日志仍显示，失败自动展开', () => {
  const { TerminalLogs } = require('../src/components/TerminalLogs.tsx');
  const { terminalEntries } = require('../src/logs.ts');
  const logs = [
    { id: 'git', time: 1, kind: 'command', text: '$ git fetch origin test' },
    {
      id: 'start',
      time: 2,
      kind: 'progress',
      text: '构建应用 · 进行中',
      groupId: 'build',
      stage: { title: '构建应用', status: 'running' },
    },
    {
      id: 'command',
      time: 3,
      kind: 'command',
      text: '$ /absolute/node react-native bundle',
      groupId: 'build',
    },
    { id: 'output', time: 4, kind: 'output', text: 'VERBOSE_BUNDLE_DETAILS', groupId: 'build' },
    {
      id: 'done',
      time: 5,
      kind: 'success',
      text: '构建应用 · 已完成',
      groupId: 'build',
      stage: { title: '构建应用', status: 'success' },
    },
    { id: 'query', time: 6, kind: 'output', text: '已查询 14 条发布记录' },
  ];
  const entries = terminalEntries(logs);
  assert.equal(entries.length, 4);
  assert.equal(entries[1].group.details[0].text, 'VERBOSE_BUNDLE_DETAILS');
  const html = renderToStaticMarkup(React.createElement(TerminalLogs, { logs }));
  assert.match(html, /git fetch/);
  assert.match(html, /react-native bundle/);
  assert.match(html, /构建应用 · 已完成/);
  assert.match(html, /已查询 14 条发布记录/);
  assert.doesNotMatch(html, /VERBOSE_BUNDLE_DETAILS/);
  assert.match(html, /aria-expanded="false"/);
  const failed = logs.map((log) =>
    log.id === 'done'
      ? {
          ...log,
          kind: 'error',
          text: '构建应用 · 失败',
          stage: { title: '构建应用', status: 'error' },
        }
      : log,
  );
  const errorHtml = renderToStaticMarkup(React.createElement(TerminalLogs, { logs: failed }));
  assert.match(errorHtml, /VERBOSE_BUNDLE_DETAILS/);
  assert.match(errorHtml, /aria-expanded="true"/);
});

test('终端接收持续构建输出时仍保留命令及阶段头', () => {
  const { retainLogs } = require('../src/logs.ts');
  const first = [
    { id: 'cmd', kind: 'command', text: '$ node build' },
    { id: 'stage', groupId: 'g', stage: { status: 'running' } },
  ];
  const logs = retainLogs([
    ...first,
    ...Array.from({ length: 600 }, (_, index) => ({
      id: String(index),
      kind: 'output',
      groupId: 'g',
      text: 'build details',
    })),
  ]);
  assert.equal(logs.length, 500);
  assert.equal(logs[0].id, 'cmd');
  assert.equal(logs[1].id, 'stage');
});
