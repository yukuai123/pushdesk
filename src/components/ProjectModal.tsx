import { Modal as AntModal } from 'antd';
import { productionRule, requiresConfirmation } from '../release-policy';
import { Checkbox, Input, Button, Disclosure, Select } from '../ui';
import { iosBuildDefaults } from '../platform';
import { FolderOpen, Plus, X } from 'lucide-react';
import { useState } from 'react';
import {
  call,
  names,
  type BuildConfig,
  type AndroidBuildConfig,
  type Project,
  type Rule,
} from '../api';
import { releasePresets } from '../release-presets';
import { uid } from '../utils';
import { Badge } from './Badge';
import { Modal } from './Modal';

export function ProjectModal({
  project,
  busy,
  close,
  onSave,
  onDelete,
}: {
  project: Project | null;
  busy: boolean;
  close: () => void;
  onSave: (draft: Project) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Project>(
    project || {
      id: '',
      name: '',
      path: '',
      app: '',
      rules: [
        {
          id: uid(),
          lane: 'stable',
          ...releasePresets.stable,
          target: '1.0.2',
        },
        { id: uid(), lane: 'gray', ...releasePresets.gray, target: '1.0.3' },
      ],
    },
  );
  const [localError, setError] = useState('');
  const [confirmationDialog, confirmationContext] = AntModal.useModal();
  function change<Key extends keyof Project>(key: Key, value: Project[Key]) {
    setDraft((x) => ({ ...x, [key]: value }));
  }
  const androidDefaults: AndroidBuildConfig = {
    directory: 'android',
    debugTask: ':app:assemble{flavor}Debug',
    releaseTask: ':app:assemble{flavor}Release',
    apkDirectory: 'app/build/outputs/apk',
    releaseRunner: 'auto',
    fastlaneDirectory: '.',
    fastlaneBundler: 'auto',
  };
  function changeAndroid(key: keyof AndroidBuildConfig, value: string) {
    change('android', { ...androidDefaults, ...draft.android, [key]: value });
  }
  function changeIOSBuild<Key extends keyof BuildConfig>(key: Key, value: BuildConfig[Key]) {
    setDraft((current) => ({
      ...current,
      ios: {
        enabled: current.ios?.enabled ?? true,
        app: current.ios?.app || '',
        build: { ...iosBuildDefaults, ...current.ios?.build, [key]: value },
      },
    }));
  }
  return (
    <Modal title={project ? '编辑项目配置' : '添加项目'} close={close} wide>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft);
        }}
      >
        {confirmationContext}
        <div className="modal-body">
          <div className="two-col">
            <label>
              项目名称
              <Input
                required
                value={draft.name}
                onChange={(e) => change('name', e.target.value)}
                placeholder="例如：供应链 PDA"
              />
            </label>
            <label>
              Android CodePush 应用名
              <Input
                required
                value={draft.app}
                onChange={(e) => change('app', e.target.value)}
                placeholder="填写服务端实际应用名"
              />
            </label>
          </div>
          <label>
            本地项目目录
            <div className="input-action">
              <Input
                required
                value={draft.path}
                onChange={(e) => change('path', e.target.value)}
                placeholder="选择 React Native 项目根目录"
              />
              <Button
                type="button"
                aria-label="选择项目目录"
                onClick={async () => {
                  try {
                    const path = await call<string | null>('pickDirectory');
                    if (path) change('path', path);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <FolderOpen size={18} />
              </Button>
            </div>
          </label>
          <Disclosure>
            <summary>Android 安装包构建配置</summary>
            <div className="two-col">
              {Object.entries({
                directory: 'Android 工程目录',
                debugTask: '调试包 Gradle 任务',
                releaseTask: '正式包 Gradle 任务',
                apkDirectory: 'APK 输出目录（相对 Android 工程）',
                fastlaneDirectory: 'Fastlane 工作目录（相对项目）',
              }).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <Input
                    required
                    value={
                      (draft.android || androidDefaults)[key as keyof AndroidBuildConfig] ??
                      androidDefaults[key as keyof AndroidBuildConfig]
                    }
                    onChange={(event) =>
                      changeAndroid(key as keyof AndroidBuildConfig, event.target.value)
                    }
                  />
                </label>
              ))}
            </div>
            <div className="two-col">
              <label>
                正式包构建方式
                <Select
                  value={draft.android?.releaseRunner || 'auto'}
                  onChange={(event) =>
                    change('android', {
                      ...androidDefaults,
                      ...draft.android,
                      releaseRunner: event.target.value as AndroidBuildConfig['releaseRunner'],
                    })
                  }
                >
                  <option value="auto">自动：有 Fastfile 时使用 Fastlane</option>
                  <option value="fastlane">Fastlane</option>
                  <option value="gradle">Gradle</option>
                </Select>
              </label>
              <label>
                Fastlane 依赖方式
                <Select
                  value={draft.android?.fastlaneBundler || 'auto'}
                  onChange={(event) =>
                    change('android', {
                      ...androidDefaults,
                      ...draft.android,
                      fastlaneBundler: event.target.value as AndroidBuildConfig['fastlaneBundler'],
                    })
                  }
                >
                  <option value="auto">自动：Gemfile 声明 fastlane 时使用 Bundler</option>
                  <option value="yes">Bundler（bundle exec fastlane）</option>
                  <option value="no">本机 Fastlane</option>
                </Select>
              </label>
            </div>
            <p className="muted tiny">
              正式包默认使用项目现有 Fastlane，测试 / 预发布 / 生产默认对应 build_test / build_stage
              / build_prod，可在下方规则中覆盖 lane。Fastlane 内的环境与签名设置优先生效。
            </p>
            <p className="muted tiny">
              Gradle 自动匹配用途对应的 Android 变体，任务中的 {'{flavor}'}{' '}
              会替换为该变体。自定义工程可填写完整任务名。
            </p>
          </Disclosure>
          <section className="ios-config">
            <Checkbox
              className="checkbox"
              checked={draft.ios?.enabled ?? false}
              onChange={(event) =>
                change('ios', {
                  enabled: event.target.checked,
                  app: draft.ios?.app || '',
                  build: { ...iosBuildDefaults, ...draft.ios?.build },
                })
              }
            >
              启用 iOS 热更新
            </Checkbox>
            {draft.ios?.enabled && (
              <>
                <label>
                  iOS CodePush 应用名
                  <Input
                    required
                    value={draft.ios.app}
                    placeholder="独立的 iOS 应用名，例如 example-ios"
                    onChange={(event) => change('ios', { ...draft.ios!, app: event.target.value })}
                  />
                </label>
                <Disclosure className="ios-advanced">
                  <summary>高级构建设置（通常无需修改）</summary>
                  <div className="two-col">
                    <label>
                      Bundle 文件名
                      <Input
                        required
                        value={draft.ios.build?.bundleName ?? iosBuildDefaults.bundleName}
                        onChange={(event) => changeIOSBuild('bundleName', event.target.value)}
                      />
                    </label>
                    <label>
                      入口文件（选填）
                      <Input
                        value={draft.ios.build?.entryFile ?? ''}
                        placeholder="自动选择 index.ios.js 或 index.js"
                        onChange={(event) => changeIOSBuild('entryFile', event.target.value)}
                      />
                    </label>
                    <label>
                      Hermes
                      <Select
                        value={draft.ios.build?.hermes ?? 'auto'}
                        onChange={(event) =>
                          changeIOSBuild('hermes', event.target.value as BuildConfig['hermes'])
                        }
                      >
                        <option value="auto">跟随 CodePush CLI（默认）</option>
                        <option value="enabled">启用</option>
                        <option value="disabled">关闭</option>
                      </Select>
                    </label>
                    <label>
                      Podfile 路径
                      <Input
                        value={draft.ios.build?.podFile ?? iosBuildDefaults.podFile}
                        placeholder="ios/Podfile"
                        onChange={(event) => changeIOSBuild('podFile', event.target.value)}
                      />
                    </label>
                  </div>
                  <Button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      change('ios', {
                        ...draft.ios!,
                        build: { ...iosBuildDefaults },
                      })
                    }
                  >
                    恢复命令默认值
                  </Button>
                </Disclosure>
                <p className="muted tiny">
                  构建默认沿用 CodePush 命令的处理方式，无需填写入口、Bundle 或
                  Hermes。版本、分支和环境规则与 Android 共用。
                </p>
              </>
            )}
          </section>
          <div className="section-title">
            <h3>版本与分支绑定</h3>
            <Button
              type="button"
              onClick={() =>
                change('rules', [
                  ...draft.rules,
                  {
                    id: uid(),
                    lane: 'test',
                    ...releasePresets.test,
                    target: '',
                  },
                ])
              }
            >
              <Plus size={14} />
              添加规则
            </Button>
          </div>
          <p className="muted tiny">
            选择发布用途会自动填入分支、部署目标和环境文件，填入后可手动修改。版本号 +
            分支为唯一配置，同版本可绑定不同分支。
          </p>
          {draft.rules.map((rule, i) => (
            <div className="rule-edit" key={rule.id}>
              <div className="rule-title">
                <Badge lane={rule.lane} />
                <Button
                  type="button"
                  aria-label="移除规则"
                  disabled={draft.rules.length === 1}
                  onClick={() =>
                    change(
                      'rules',
                      draft.rules.filter((_, j) => j !== i),
                    )
                  }
                >
                  <X size={14} />
                </Button>
              </div>
              <div className="rule-grid">
                {[
                  ['lane', '发布用途'],
                  ['branch', '来源分支'],
                  ['deployment', '部署目标'],
                  ['target', '包版本号'],
                  ['tag', '备注标签（选填）'],
                  ['envFile', '环境文件'],
                  ['androidFlavor', 'Gradle 安装包变体（选填）'],
                  ['androidLane', 'Android 正式包 Fastlane lane（选填）'],
                ].map(([k, label]) => (
                  <label key={k}>
                    {label}
                    {k === 'lane' ? (
                      <Select
                        value={rule.lane}
                        onChange={(e) =>
                          change(
                            'rules',
                            draft.rules.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    lane: e.target.value,
                                    ...releasePresets[e.target.value],
                                  }
                                : x,
                            ),
                          )
                        }
                      >
                        {Object.entries(names).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      <Input
                        required={!['tag', 'androidFlavor', 'androidLane'].includes(k)}
                        maxLength={k === 'tag' ? 80 : undefined}
                        value={String(rule[k as keyof Rule] || '')}
                        placeholder={
                          k === 'androidFlavor'
                            ? '自动识别，例如 development / stage / production'
                            : undefined
                        }
                        onChange={(e) =>
                          change(
                            'rules',
                            draft.rules.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    [k]: ['androidFlavor', 'androidLane'].includes(k)
                                      ? e.target.value || undefined
                                      : e.target.value,
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                    )}
                  </label>
                ))}
              </div>
              <div className="confirmation-option">
                {productionRule(rule) ? (
                  <span className="muted tiny">生产与灰度发布始终需要二次确认</span>
                ) : (
                  <Checkbox
                    checked={requiresConfirmation(rule)}
                    onChange={(event) =>
                      change(
                        'rules',
                        draft.rules.map((item) =>
                          item.id === rule.id ? { ...item, confirm: event.target.checked } : item,
                        ),
                      )
                    }
                  >
                    发布前二次确认（测试 / 预发布默认关闭）
                  </Checkbox>
                )}
              </div>
            </div>
          ))}
          {localError && (
            <p role="alert" className="danger">
              {localError}
            </p>
          )}
        </div>
        <div className="modal-footer">
          {project && (
            <Button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => {
                confirmationDialog.confirm({
                  title: '移除此项目配置？',
                  content: '本机发布记录会保留。',
                  okText: '移除',
                  cancelText: '取消',
                  okButtonProps: { danger: true },
                  onOk: () => onDelete(project.id),
                });
              }}
            >
              移除项目
            </Button>
          )}
          <span className="grow" />
          <Button type="button" onClick={close}>
            取消
          </Button>
          <Button className="primary" disabled={busy}>
            保存配置
          </Button>
        </div>
      </form>
    </Modal>
  );
}
