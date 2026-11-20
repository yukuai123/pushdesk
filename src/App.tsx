import { ConfigProvider, theme as antTheme, Alert } from 'antd';
import { Button, Select } from './ui';
import { PlatformSwitch } from './components/PlatformSwitch';
import { appName, platformNames, deploymentTargets } from './platform';
import {
  AlertCircle,
  ArrowUpRight,
  Box,
  ChevronDown,
  ChevronRight,
  Copy,
  GitBranch,
  History,
  Layers,
  LayoutDashboard,
  Moon,
  Plus,
  Settings,
  Sun,
  Terminal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  call,
  desktop,
  empty,
  type Platform,
  type Project,
  type State,
  type Task,
  type VersionUpdate,
} from './api';
import { Badge } from './components/Badge';
import { Confirm } from './components/Confirm';
import { Empty } from './components/Empty';
import { ErrorContext } from './components/Modal';
import { ProjectModal } from './components/ProjectModal';
import { TaskRow } from './components/TaskRow';
import { TerminalLogs } from './components/TerminalLogs';
import { retainLogs } from './logs';
import { Overview } from './pages/Overview';
import { Publish } from './pages/Publish';
import { SettingsPanel } from './pages/SettingsPanel';

type Page = 'overview' | 'publish' | 'history' | 'projects' | 'settings';
const navigation: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: '线上版本', icon: LayoutDashboard },
  { id: 'publish', label: '发布工作台', icon: GitBranch },
  { id: 'history', label: '发布记录', icon: History },
  { id: 'projects', label: '项目管理', icon: Layers },
];

export function App() {
  const [state, setState] = useState<State>(empty),
    [page, setPage] = useState<Page>('overview'),
    [platform, setPlatform] = useState<Platform>('android'),
    [selectedRuleId, setSelectedRuleId] = useState(''),
    [selectedDeployment, setSelectedDeployment] = useState(''),
    [historyRequest, setHistoryRequest] = useState({ loading: false, error: '' }),
    [projectId, setProjectId] = useState(''),
    [theme, setTheme] = useState(
      () =>
        localStorage.getItem('pushdesk-theme') ||
        (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
    ),
    [modal, setModal] = useState<string | null>(null),
    [editing, setEditing] = useState<Project | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState<{ title: string; body: string; status: string } | null>(null),
    [working, setWorking] = useState(false),
    [terminal, setTerminal] = useState(true),
    [extraLogs, setExtraLogs] = useState<State['logs']>([]),
    [filter, setFilter] = useState(''),
    [laneFilter, setLaneFilter] = useState('all'),
    [task, setTask] = useState<Task | null>(null);
  const project = state.projects.find((project) => project.id === projectId) || state.projects[0];
  const activePlatform: Platform = project?.ios?.enabled ? platform : 'android';
  const deployments = deploymentTargets(project);
  const activeDeployment = deployments.includes(selectedDeployment)
    ? selectedDeployment
    : deployments[0];
  const currentApp = project ? appName(project, activePlatform) : '';
  const historySequence = useRef(0);
  const logs = [...state.logs, ...extraLogs];
  async function reload() {
    if (desktop) {
      const data = await call<State>('snapshot');
      setState(data);
      setExtraLogs([]);
    }
  }
  useEffect(() => {
    reload();
    return window.pushdesk?.onEvent((e) => {
      if (e.type === 'feedback') setNotice(e.data);
      else if (e.type === 'openTask') {
        setTask(e.data);
        setModal('confirm');
      } else if (e.type === 'change') reload();
      else if (e.type === 'log') setExtraLogs((x) => retainLogs([...x, e.data]));
    });
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('pushdesk-theme', theme);
    if (desktop) void call('setTheme', theme).catch(() => {});
  }, [theme]);
  async function action(fn: () => Promise<unknown>) {
    setWorking(true);
    setError('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function updateVersion(input: VersionUpdate) {
    setWorking(true);
    try {
      const updated = await call<Project>('updateVersion', input);
      await reload();
      return updated;
    } finally {
      setWorking(false);
    }
  }
  function openPublish(ruleId = '') {
    setSelectedRuleId(ruleId);
    setPage('publish');
  }
  async function refresh() {
    if (!project) return;
    const sequence = ++historySequence.current;
    setHistoryRequest({ loading: true, error: '' });
    try {
      await call('history', {
        projectId: project.id,
        deployment: activeDeployment,
        platform: activePlatform,
      });
      await reload();
      if (sequence === historySequence.current) setHistoryRequest({ loading: false, error: '' });
    } catch (error) {
      if (sequence === historySequence.current)
        setHistoryRequest({ loading: false, error: (error as Error).message });
    }
  }
  useEffect(() => {
    if (page === 'overview' && project && state.hasToken) void refresh();
    else setHistoryRequest({ loading: false, error: '' });
    return () => {
      historySequence.current += 1;
    };
  }, [page, project?.id, currentApp, activePlatform, activeDeployment, state.hasToken]);
  function changeDeployment(value: string) {
    setSelectedDeployment(value);
    setFilter('');
    setLaneFilter('all');
  }
  function edit(project: Project | null) {
    setEditing(project);
    setModal('project');
  }
  const pending = state.tasks.filter((t) =>
    ['ready', 'unknown', 'building', 'uploading'].includes(t.status),
  );
  return (
    <ConfigProvider
      theme={{
        algorithm: theme === 'dark' ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: { colorPrimary: '#5275dd', borderRadius: 6, controlHeight: 30, fontSize: 13 },
        components: { Button: { controlHeight: 30 }, Modal: { paddingContentHorizontalLG: 0 } },
      }}
    >
      <ErrorContext.Provider value={error}>
        <div className="window-titlebar">
          <span>PushDesk</span>
          <span>热更新发布工作台</span>
        </div>
        <div className="app">
          <aside className="sidebar">
            <div className="brand">
              <span className="brand-icon">
                <Layers size={21} />
              </span>
              <div>
                PushDesk<small>移动热更新工作台</small>
              </div>
            </div>
            <div className="workspace-label">
              工作空间 <span>本地</span>
            </div>
            <nav>
              {navigation.map(({ id, label, icon: Icon }) => (
                <Button
                  key={id}
                  className={page === id ? 'nav active' : 'nav'}
                  onClick={() => setPage(id)}
                >
                  <Icon size={18} />
                  {label}
                  {id === 'publish' && pending.length > 0 ? <b>{pending.length}</b> : null}
                </Button>
              ))}
            </nav>
            <div className="sidebar-projects">
              <div className="workspace-label">
                项目{' '}
                <Button aria-label="添加项目" onClick={() => edit(null)}>
                  <Plus size={15} />
                </Button>
              </div>
              {state.projects.map((project) => (
                <Button
                  key={project.id}
                  className={'project-link ' + (project?.id === project.id ? 'selected' : '')}
                  onClick={() => {
                    setProjectId(project.id);
                    setPage('overview');
                  }}
                >
                  <span>{project.name.slice(0, 1)}</span>
                  {project.name}
                </Button>
              ))}
              {!state.projects.length && <p className="muted tiny">添加项目，开始管理热更新</p>}
            </div>
            <div className="side-bottom">
              <div className={'connection ' + (state.hasToken ? 'online' : '')}>
                <i />
                {state.hasToken ? '访问令牌已配置' : '尚未连接服务'}
              </div>
              <Button
                className={'nav ' + (page === 'settings' ? 'active' : '')}
                onClick={() => setPage('settings')}
              >
                <Settings size={17} />
                服务与设置
              </Button>
              <Button
                className="nav"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              >
                {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}切换
                {theme === 'light' ? '夜晚' : '白天'}模式
              </Button>
              <div className="version">
                PushDesk <span>v0.1.0</span>
              </div>
            </div>
          </aside>
          <div className="main">
            <header>
              <div className="breadcrumb">
                工作空间 <ChevronRight size={13} />
                <span>
                  {
                    {
                      overview: '线上版本',
                      publish: '发布工作台',
                      history: '发布记录',
                      projects: '项目管理',
                      settings: '服务与设置',
                    }[page]
                  }
                </span>
              </div>
              <div className="header-right">
                <span className="platform">
                  <Box size={14} /> {platformNames[activePlatform]}
                </span>
                <Button
                  className="icon-btn"
                  aria-label="切换主题"
                  onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                >
                  {theme === 'light' ? <Sun size={17} /> : <Moon size={17} />}
                </Button>
              </div>
            </header>
            {!desktop && (
              <div className="preview-banner">
                界面预览 · 本地命令与发布功能请在 PushDesk 桌面应用中使用
              </div>
            )}
            <main data-page={page}>
              {notice && (
                <Alert
                  className="release-feedback"
                  showIcon
                  closable
                  onClose={() => setNotice(null)}
                  type={
                    notice.status === 'success'
                      ? 'success'
                      : notice.status === 'error'
                        ? 'error'
                        : 'info'
                  }
                  message={notice.title}
                  description={notice.body}
                />
              )}
              {error && (
                <div role="alert" className="error">
                  <AlertCircle size={17} />
                  <span>{error}</span>
                  <Button aria-label="关闭错误提示" onClick={() => setError('')}>
                    <X size={16} />
                  </Button>
                </div>
              )}
              <div className="page-title">
                <div>
                  <h1>
                    {
                      {
                        overview: '线上版本',
                        publish: '发布工作台',
                        history: '发布记录',
                        projects: '项目管理',
                        settings: '服务与设置',
                      }[page]
                    }
                  </h1>
                  <p>
                    {
                      {
                        overview: '看清每一个版本，让每一次发布都有据可查。',
                        publish: '绑定分支，固定代码，确认后发布。',
                        history: '从构建到服务端确认，追踪每一次操作。',
                        projects: '把项目、分支和发布目标放在一起管理。',
                        settings: '连接内网 CodePush 服务，管理本机执行环境。',
                      }[page]
                    }
                  </p>
                </div>
                {page === 'projects' ? (
                  <Button className="primary" onClick={() => edit(null)}>
                    <Plus size={16} />
                    添加项目
                  </Button>
                ) : page === 'overview' && project ? (
                  <Button className="primary" onClick={() => openPublish()}>
                    <Plus size={16} />
                    准备发布
                  </Button>
                ) : null}
              </div>
              {['overview', 'publish'].includes(page) && project && (
                <div className="project-bar">
                  <span className="project-avatar">{project.name.slice(0, 1)}</span>
                  <Select
                    aria-label="当前项目"
                    value={project.id}
                    onChange={(e) => setProjectId(e.target.value)}
                  >
                    {state.projects.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </Select>
                  <span className="divider" />
                  {project.ios?.enabled && (
                    <PlatformSwitch value={activePlatform} onChange={setPlatform} />
                  )}
                  <code>{appName(project, activePlatform)}</code>
                  <span className="grow" />
                  <Button className="text-button" onClick={() => edit(project)}>
                    配置项目 <ArrowUpRight size={14} />
                  </Button>
                </div>
              )}
              {page === 'overview' && (
                <Overview
                  platform={activePlatform}
                  project={project}
                  state={state}
                  filter={filter}
                  setFilter={setFilter}
                  laneFilter={laneFilter}
                  setLaneFilter={setLaneFilter}
                  busy={working || state.busy}
                  onRefresh={refresh}
                  deployment={activeDeployment}
                  onDeploymentChange={changeDeployment}
                  historyLoading={historyRequest.loading}
                  historyError={historyRequest.error}
                  onEdit={edit}
                  onPublish={openPublish}
                  onUpdateVersion={updateVersion}
                />
              )}
              {page === 'projects' && (
                <div className="projects-list">
                  {state.projects.map((x) => (
                    <article className="panel project-item" key={x.id}>
                      <div className="project-avatar">{x.name.slice(0, 1)}</div>
                      <div className="grow">
                        <h3>{x.name}</h3>
                        <p className="mono muted">{x.path}</p>
                        <div className="chips">
                          <code>Android · {x.app}</code>
                          {x.ios?.enabled && <code>iOS · {x.ios.app}</code>}
                          {x.rules.map((r) => (
                            <Badge key={r.id} lane={r.lane} />
                          ))}
                        </div>
                      </div>
                      <Button onClick={() => edit(x)}>编辑配置</Button>
                    </article>
                  ))}
                  {!state.projects.length && <Empty onAdd={() => edit(null)} />}
                </div>
              )}
              {page === 'publish' &&
                (project ? (
                  <>
                    <Publish
                      key={project.id + activePlatform + selectedRuleId}
                      initialRuleId={selectedRuleId}
                      platform={activePlatform}
                      project={project}
                      busy={working || state.busy}
                      onPrepare={(data) =>
                        action(async () => {
                          const t = await call<Task>('prepare', data);
                          if (t.status === 'ready') {
                            setTask(t);
                            setModal('confirm');
                          } else if (t.status === 'unknown') {
                            setTask(t);
                            setModal('confirm');
                          }
                        })
                      }
                    />
                    {pending
                      .filter((t) => t.projectId === project.id)
                      .map((t) => (
                        <TaskRow
                          key={t.id}
                          t={t}
                          onOpen={() => {
                            setTask(t);
                            setModal('confirm');
                          }}
                        />
                      ))}
                  </>
                ) : (
                  <Empty onAdd={() => edit(null)} />
                ))}
              {page === 'history' && (
                <div className="panel">
                  <div className="panel-heading">
                    <h2>本机发布记录</h2>
                    <span className="muted tiny">{state.tasks.length} 次任务</span>
                  </div>
                  {state.tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      t={t}
                      onOpen={() => {
                        setTask(t);
                        setModal('confirm');
                      }}
                    />
                  ))}
                  {!state.tasks.length && (
                    <div className="empty-table">
                      <History size={28} />
                      <h3>还没有发布任务</h3>
                      <p>构建、发布及回查结果会保存在这里。</p>
                    </div>
                  )}
                </div>
              )}
              {page === 'settings' && (
                <SettingsPanel
                  state={state}
                  busy={working || state.busy}
                  onSave={(v) => action(() => call('saveSettings', v))}
                  onAuth={(value) => action(() => call('authenticate', { value }))}
                  onInspect={() =>
                    project &&
                    action(async () => {
                      await call('inspect', { projectId: project.id });
                    })
                  }
                />
              )}
            </main>
            <section className={'terminal ' + (!terminal ? 'collapsed' : '')}>
              <div className="terminal-head">
                <Button onClick={() => setTerminal(!terminal)}>
                  <Terminal size={16} />
                  <strong>执行终端</strong>
                  <span className="terminal-dot" />
                  {state.busy ? '执行中' : '就绪'}
                  <ChevronDown size={15} className={!terminal ? 'rotate' : ''} />
                </Button>
                <div>
                  <span>命令与进度 · 构建详情默认收起</span>
                  <Button
                    aria-label="复制终端日志"
                    onClick={() =>
                      navigator.clipboard
                        .writeText(logs.map((l) => l.text).join('\n'))
                        .catch(() => setError('无法复制，请手动选择日志'))
                    }
                  >
                    <Copy size={14} />
                  </Button>
                </div>
              </div>
              {terminal && (
                <div className="terminal-body">
                  {!logs.length ? (
                    <>
                      <div className="terminal-welcome">
                        <span>PushDesk</span> / 移动热更新工作台
                      </div>
                      <p>所有查询、Git 检查、构建与发布将在这里显示。</p>
                      <p className="terminal-note">
                        历史查询直接执行 CodePush CLI；构建与上传分阶段执行。访问令牌自动脱敏。
                      </p>
                      <div className="prompt">
                        ❯ <span className="cursor" />
                      </div>
                    </>
                  ) : (
                    <TerminalLogs logs={logs} />
                  )}
                </div>
              )}
            </section>
          </div>
          {modal === 'project' && (
            <ProjectModal
              project={editing}
              busy={working}
              close={() => setModal(null)}
              onSave={(v) =>
                action(async () => {
                  const x = await call<Project>('saveProject', v);
                  setProjectId(x.id);
                  setModal(null);
                })
              }
              onDelete={(id) =>
                action(async () => {
                  await call('removeProject', id);
                  setModal(null);
                })
              }
            />
          )}
          {modal === 'confirm' && task && (
            <Confirm
              task={state.tasks.find((t) => t.id === task.id) || task}
              busy={working || state.busy}
              close={() => setModal(null)}
              onPublish={(confirmation) =>
                action(async () => {
                  await call('publish', { id: task.id, confirmation });
                  setModal(null);
                })
              }
              onReconcile={() => action(() => call('reconcile', task.id))}
              onDiscard={() =>
                action(async () => {
                  await call('discard', task.id);
                  setModal(null);
                })
              }
            />
          )}
        </div>
      </ErrorContext.Provider>
    </ConfigProvider>
  );
}
