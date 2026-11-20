export type Platform = 'android' | 'ios';
export type BuildConfig = {
  entryFile: string;
  bundleName: string;
  podFile: string;
  hermes: 'auto' | 'enabled' | 'disabled';
};
export type IOSConfig = { enabled: boolean; app: string; build: BuildConfig };

export type Rule = {
  id: string;
  lane: string;
  branch: string;
  deployment: string;
  target: string;
  envFile: string;
  tag?: string;
  confirm?: boolean;
};
export type VersionRecord = Pick<Rule, 'target' | 'deployment' | 'lane' | 'branch' | 'tag'>;
export type VersionUpdate = {
  projectId: string;
  ruleId: string;
  expectedTarget: string;
  expectedBranch?: string;
  branch?: string;
  target: string;
  tag: string;
};
export type Project = {
  id: string;
  name: string;
  path: string;
  app: string;
  rules: Rule[];
  ios?: IOSConfig;
  versionRecords?: VersionRecord[];
};
export type Release = {
  label: string;
  appVersion: string;
  description: string;
  uploadTime: number;
  isMandatory: boolean;
  isDisabled: boolean;
  rollout: number;
  size: number;
};
export type Task = {
  id: string;
  projectId: string;
  projectName: string;
  platform?: Platform;
  build?: BuildConfig;
  app: string;
  rule: Rule;
  status: string;
  createdAt: number;
  description: string;
  mandatory: boolean;
  commit?: string;
  sha256?: string;
  size?: number;
  artifact?: string;
  error?: string;
  label?: string;
  logs?: Log[];
};
export type Log = {
  id: string;
  time: number;
  text: string;
  kind: string;
  groupId?: string;
  groupTitle?: string;
  stage?: { title: string; status: 'running' | 'success' | 'error' };
};
export type State = {
  projects: Project[];
  settings: { url: string; node: string; git: string };
  hasToken: boolean;
  tasks: Task[];
  logs: Log[];
  busy: boolean;
  histories: Record<string, { items: Release[]; time: number } | null>;
};
export type PrepareInput = {
  platform?: Platform;
  projectId: string;
  ruleId: string;
  description?: string;
  mandatory: boolean;
};
export type DesktopEvent =
  | { type: 'change' }
  | { type: 'log'; data: Log }
  | { type: 'openTask'; data: Task }
  | { type: 'feedback'; data: { title: string; body: string; status: string } };
export type CommandName =
  | 'snapshot'
  | 'setTheme'
  | 'saveProject'
  | 'updateVersion'
  | 'removeProject'
  | 'saveSettings'
  | 'authenticate'
  | 'apps'
  | 'history'
  | 'inspect'
  | 'prepare'
  | 'publish'
  | 'reconcile'
  | 'discard'
  | 'pickDirectory'
  | 'pickFile'
  | 'openTaskFolder';
type CommandResult = { ok: true; data: unknown } | { ok: false; error: string; status?: number };
type DesktopBridge = {
  [Name in CommandName]: (arg?: unknown) => Promise<CommandResult>;
} & { onEvent: (callback: (event: DesktopEvent) => void) => () => void };
declare global {
  interface Window {
    pushdesk?: DesktopBridge;
  }
}
export const desktop = !!window.pushdesk;
export async function call<T = unknown>(name: CommandName, arg?: unknown): Promise<T> {
  if (!window.pushdesk) throw new Error('请在桌面应用中使用此功能。浏览器仅供界面预览。');
  const result = await window.pushdesk[name](arg);
  if (!result.ok) throw new Error(result.error);
  return result.data as T;
}
export const empty: State = {
  projects: [],
  settings: {
    url: 'https://code-push-server.tastientech.com',
    node: 'node',
    git: 'git',
  },
  hasToken: false,
  tasks: [],
  logs: [],
  busy: false,
  histories: {},
};
export const names: Record<string, string> = {
  stable: '生产正式',
  gray: '生产灰度',
  staging: '预发布',
  test: '测试',
};
export const statuses: Record<string, string> = {
  building: '构建中',
  ready: '待确认发布',
  uploading: '上传中',
  unknown: '结果待回查',
  confirmed: '服务端已确认',
  failed: '执行失败',
  discarded: '已放弃',
  outdated: '版本已变更，需重新构建',
};
