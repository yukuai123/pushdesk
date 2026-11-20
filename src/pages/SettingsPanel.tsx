import { Input, Button, Disclosure } from '../ui';
import { FolderOpen, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { call, type State } from '../api';

export function SettingsPanel({
  state,
  busy,
  onSave,
  onAuth,
  onInspect,
}: {
  state: State;
  busy: boolean;
  onSave: (settings: State['settings']) => void;
  onAuth: (settingsDraft: string) => void;
  onInspect: () => void;
}) {
  const [settingsDraft, setSettingsDraft] = useState(state.settings),
    [token, setToken] = useState('');
  return (
    <div className="settings-grid">
      <div className="panel">
        <div className="panel-heading">
          <h2>CodePush 服务</h2>
          <span className={'status ' + (state.hasToken ? 'ok' : '')}>
            {state.hasToken ? '已配置凭证' : '待鉴权'}
          </span>
        </div>
        <form
          className="settings-body"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(settingsDraft);
          }}
        >
          <label>
            服务地址
            <Input
              type="url"
              required
              value={settingsDraft.url}
              onChange={(e) => setSettingsDraft({ ...settingsDraft, url: e.target.value })}
            />
          </label>
          <label>
            Node.js 可执行文件
            <div className="input-action">
              <Input
                required
                value={settingsDraft.node}
                onChange={(e) => setSettingsDraft({ ...settingsDraft, node: e.target.value })}
              />
              <Button
                type="button"
                aria-label="选择 Node.js"
                onClick={async () => {
                  const node = await call<string | null>('pickFile');
                  if (node) setSettingsDraft({ ...settingsDraft, node });
                }}
              >
                <FolderOpen size={16} />
              </Button>
            </div>
          </label>
          <label>
            Git 可执行文件
            <Input
              required
              value={settingsDraft.git}
              onChange={(e) => setSettingsDraft({ ...settingsDraft, git: e.target.value })}
            />
          </label>
          <Disclosure>
            <summary>Android 与 Fastlane 环境（自动识别，可选）</summary>
            <div className="two-col">
              {(
                [
                  ['androidSdk', 'Android SDK 目录', '自动识别 Android SDK'],
                  ['javaHome', 'JDK 目录', '自动使用 Android Studio 内置 JDK'],
                  ['adb', 'adb 可执行文件', '自动使用 SDK 内的 adb'],
                  ['fastlane', 'Fastlane 可执行文件', '自动识别 Homebrew / PATH'],
                  ['bundle', 'Bundler 可执行文件', '使用 Bundler 时自动识别'],
                ] as const
              ).map(([key, label, placeholder]) => (
                <label key={key}>
                  {label}
                  <Input
                    value={settingsDraft[key] || ''}
                    placeholder={placeholder}
                    onChange={(event) =>
                      setSettingsDraft({ ...settingsDraft, [key]: event.target.value })
                    }
                  />
                </label>
              ))}
            </div>
          </Disclosure>
          <div className="form-footer">
            <Button type="button" disabled={busy || !state.projects.length} onClick={onInspect}>
              检测环境
            </Button>
            <Button className="primary" disabled={busy}>
              保存设置
            </Button>
          </div>
        </form>
      </div>
      <div className="panel">
        <div className="panel-heading">
          <h2>访问令牌</h2>
          <ShieldCheck size={18} />
        </div>
        <form
          className="settings-body"
          onSubmit={(e) => {
            e.preventDefault();
            onAuth(token);
            setToken('');
          }}
        >
          <p className="muted">访问令牌失效时，在这里填入新令牌并重新验证。</p>
          <label>
            访问令牌
            <Input
              type="password"
              autoComplete="off"
              required
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="粘贴新的访问令牌"
            />
          </label>
          <div className="notice">
            <ShieldCheck size={17} />
            <span>
              验证成功后使用系统安全存储加密保存。终端、项目配置和发布记录不显示访问令牌。
            </span>
          </div>
          <Button className="primary" disabled={busy}>
            验证并更新访问令牌
          </Button>
          <p className="muted tiny">
            发布结果未知时，更新访问令牌后请先回查结果，不会自动重复发布。
          </p>
        </form>
      </div>
    </div>
  );
}
