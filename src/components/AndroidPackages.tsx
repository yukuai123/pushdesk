import { Alert, Segmented, Table, Tabs, Tag } from 'antd';
import { useEffect, useState } from 'react';
import { call, type AndroidPackage, type AndroidDevice, type Project } from '../api';
import { date } from '../utils';
import { Button, Select } from '../ui';
import { Modal } from './Modal';

const variantNames = { debug: '调试包', release: '正式包', imported: '本地 APK' };
export function AndroidPackages({
  project,
  packages,
  busy,
  close,
  onChanged,
  onConfigure,
}: {
  project: Project;
  packages: AndroidPackage[];
  busy: boolean;
  close: () => void;
  onChanged: () => Promise<void>;
  onConfigure: () => void;
}) {
  const [tab, setTab] = useState('build');
  const [ruleId, setRuleId] = useState(
    project.rules.find((rule) => rule.lane === 'test')?.id || project.rules[0]?.id || '',
  );
  const [variant, setVariant] = useState<'debug' | 'release'>('debug');
  const [apkKey, setApkKey] = useState('');
  const [serial, setSerial] = useState('');
  const [devices, setDevices] = useState<AndroidDevice[]>([]);
  const [operation, setOperation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const records = packages.filter((item) => item.projectId === project.id);
  const options = records
    .filter((record) => record.status === 'ready')
    .flatMap((record) =>
      record.apks.map((apk) => ({ key: record.id + '/' + apk.id, record, apk })),
    );
  const selected = options.find((option) => option.key === apkKey);
  const disabled = busy || !!operation;
  async function perform(name: string, fn: () => Promise<void>) {
    setOperation(name);
    setError('');
    setSuccess('');
    try {
      await fn();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setOperation('');
    }
  }
  async function refreshDevices() {
    const found = await call<AndroidDevice[]>('listAndroidDevices');
    setDevices(found);
    setSerial((current) =>
      found.some((item) => item.serial === current && item.state === 'device' && item.emulator)
        ? current
        : '',
    );
  }
  useEffect(() => {
    if (tab !== 'install') return;
    let cancelled = false;
    setOperation('devices');
    setError('');
    call<AndroidDevice[]>('listAndroidDevices')
      .then((found) => {
        if (!cancelled) {
          setDevices(found);
          setSerial((current) =>
            found.some(
              (item) => item.serial === current && item.state === 'device' && item.emulator,
            )
              ? current
              : '',
          );
        }
      })
      .catch((error) => {
        if (!cancelled) setError(error.message);
      })
      .finally(() => {
        if (!cancelled) setOperation('');
      });
    return () => {
      cancelled = true;
    };
  }, [tab]);
  return (
    <Modal
      title={project.name + ' · Android 安装包'}
      close={close}
      wide
      className="android-package-modal"
    >
      <div className="modal-body android-packages">
        {error && <Alert type="error" showIcon message={error} />}
        {success && <Alert type="success" showIcon message={success} />}
        <Tabs
          activeKey={tab}
          onChange={(value) => {
            setTab(value);
            setError('');
            setSuccess('');
          }}
          items={[
            {
              key: 'build',
              disabled: !!operation,
              label: '打包',
              children: (
                <>
                  <div className="apk-build-form">
                    <label>
                      版本与来源分支
                      <Select
                        aria-label="安装包版本与分支"
                        value={ruleId}
                        disabled={disabled}
                        onChange={(event) => setRuleId(event.target.value)}
                      >
                        {project.rules.map((rule) => (
                          <option key={rule.id} value={rule.id}>
                            {rule.target} · {rule.branch} · {rule.envFile}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label>
                      安装包类型
                      <Segmented
                        options={[
                          { value: 'debug', label: '调试包' },
                          { value: 'release', label: '正式包' },
                        ]}
                        value={variant}
                        disabled={disabled}
                        onChange={(value) => setVariant(value as 'debug' | 'release')}
                      />
                    </label>
                    <Button
                      type="button"
                      className="primary"
                      disabled={disabled || !ruleId}
                      onClick={() =>
                        perform('build', async () => {
                          await call<AndroidPackage>('buildAndroidPackage', {
                            projectId: project.id,
                            ruleId,
                            variant,
                          });
                          await onChanged();
                          setSuccess('打包成功。可打开输出目录，或切换到“安装”手动选择 APK。');
                        })
                      }
                    >
                      {operation === 'build' ? '正在打包…' : '构建' + variantNames[variant]}
                    </Button>
                  </div>
                  <p className="muted tiny">
                    拉取所选分支最新代码后独立构建，只生成 APK，不自动安装。正式包默认复用项目
                    Fastlane（无 Fastfile 时使用 Gradle）；包内版本、环境与签名沿用构建配置。
                  </p>
                  <div className="section-title">
                    <h3>安装包记录</h3>
                    <Button
                      type="button"
                      className="text-button"
                      disabled={disabled}
                      onClick={onConfigure}
                    >
                      构建配置
                    </Button>
                  </div>
                  <Table<AndroidPackage>
                    size="small"
                    dataSource={records}
                    rowKey="id"
                    pagination={false}
                    scroll={{ y: 230, x: 650 }}
                    locale={{ emptyText: '还没有安装包，选择分支和类型开始打包' }}
                    columns={[
                      {
                        title: '类型 / 分支',
                        key: 'variant',
                        width: 200,
                        render: (_, record) => (
                          <>
                            <strong>{variantNames[record.variant]}</strong>
                            <div className="tiny mono muted">
                              {record.rule
                                ? record.rule.target + ' · ' + record.rule.branch
                                : '手动选择的本地文件'}
                            </div>
                            <div className="tiny muted">{date(record.createdAt)}</div>
                          </>
                        ),
                      },
                      {
                        title: '文件 / 结果',
                        key: 'files',
                        render: (_, record) => (
                          <>
                            <Tag
                              color={
                                record.status === 'ready'
                                  ? 'green'
                                  : record.status === 'failed'
                                    ? 'red'
                                    : 'blue'
                              }
                            >
                              {record.status === 'ready'
                                ? '可安装'
                                : record.status === 'failed'
                                  ? '构建失败'
                                  : '构建中'}
                            </Tag>
                            {record.apks.map((apk) => (
                              <div className="tiny break" key={apk.id}>
                                {apk.name} · {(apk.size / 1024 / 1024).toFixed(1)} MB
                              </div>
                            ))}
                            {record.error && (
                              <div className="danger tiny break">{record.error}</div>
                            )}
                            {record.commit && (
                              <div className="tiny muted mono">{record.commit.slice(0, 8)}</div>
                            )}
                          </>
                        ),
                      },
                      {
                        title: '操作',
                        key: 'actions',
                        width: 160,
                        render: (_, record) => (
                          <div className="apk-row-actions">
                            <Button
                              type="button"
                              disabled={disabled || !record.apks.length}
                              onClick={() =>
                                perform('folder', async () => {
                                  await call('openAndroidPackageFolder', record.id);
                                })
                              }
                            >
                              打开目录
                            </Button>
                            <Button
                              type="button"
                              disabled={disabled || !record.apks.length}
                              onClick={() => {
                                setApkKey(record.id + '/' + record.apks[0].id);
                                setTab('install');
                              }}
                            >
                              选择安装
                            </Button>
                          </div>
                        ),
                      },
                    ]}
                  />
                </>
              ),
            },
            {
              key: 'install',
              disabled: !!operation,
              label: '安装',
              children: (
                <>
                  <div className="section-title">
                    <h3>选择安装包</h3>
                    <Button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        perform('import', async () => {
                          const record = await call<AndroidPackage | null>('importAndroidApk', {
                            projectId: project.id,
                          });
                          if (record) {
                            await onChanged();
                            setApkKey(record.id + '/' + record.apks[0].id);
                          }
                        })
                      }
                    >
                      选择本地 APK
                    </Button>
                  </div>
                  <label>
                    待安装的 APK
                    <Select
                      aria-label="待安装的 APK"
                      value={selected?.key || ''}
                      disabled={disabled}
                      onChange={(event) => setApkKey(event.target.value)}
                    >
                      <option value="" disabled>
                        选择已构建的包，或从本地选择 APK
                      </option>
                      {options.map((option) => (
                        <option key={option.key} value={option.key}>
                          {variantNames[option.record.variant]} ·{' '}
                          {option.record.rule?.branch || '本地文件'} · {option.apk.name} ·{' '}
                          {date(option.record.createdAt)}
                        </option>
                      ))}
                    </Select>
                  </label>
                  {selected && (
                    <p className="muted tiny break">
                      {selected.apk.path}
                      {selected.record.variant === 'imported'
                        ? ' · 本地 APK，请确认所属应用和签名。'
                        : ''}
                    </p>
                  )}
                  <div className="section-title">
                    <h3>选择目标模拟器</h3>
                    <Button
                      type="button"
                      disabled={disabled}
                      onClick={() => perform('devices', refreshDevices)}
                    >
                      {operation === 'devices' ? '正在检测…' : '刷新模拟器'}
                    </Button>
                  </div>
                  <Select
                    aria-label="目标 Android 模拟器"
                    value={serial}
                    disabled={disabled}
                    onChange={(event) => setSerial(event.target.value)}
                  >
                    <option value="" disabled>
                      手动选择已启动的 Android 模拟器
                    </option>
                    {devices.map((device) => (
                      <option
                        key={device.serial}
                        value={device.serial}
                        disabled={device.state !== 'device' || !device.emulator}
                      >
                        {device.model} · {device.serial} ·{' '}
                        {device.state === 'offline'
                          ? '离线'
                          : device.state === 'unauthorized'
                            ? '未授权'
                            : device.emulator
                              ? '模拟器'
                              : '非模拟器'}
                      </option>
                    ))}
                  </Select>
                  {!devices.length && operation !== 'devices' && (
                    <p className="muted tiny">
                      未发现已连接的设备。请先在 Android Studio 启动模拟器，再刷新列表。
                    </p>
                  )}
                  <p className="muted tiny">
                    只安装当前选择的 APK
                    到指定模拟器。签名不一致或版本不兼容时保留原应用并提示错误；调试包通常需要项目的
                    Metro 服务。
                  </p>
                  <div className="form-footer">
                    <Button
                      type="button"
                      className="primary"
                      disabled={disabled || !selected || !serial}
                      onClick={() =>
                        perform('install', async () => {
                          if (!selected) return;
                          const result = await call<{ serial: string; model: string }>(
                            'installAndroidApk',
                            { buildId: selected.record.id, apkId: selected.apk.id, serial },
                          );
                          await onChanged();
                          setSuccess(
                            '安装成功：' +
                              selected.apk.name +
                              ' → ' +
                              result.model +
                              ' (' +
                              result.serial +
                              ')',
                          );
                        })
                      }
                    >
                      {operation === 'install' ? '正在安装…' : '安装到所选模拟器'}
                    </Button>
                  </div>
                </>
              ),
            },
          ]}
        />
      </div>
      <div className="modal-footer">
        <span className="muted tiny">命令与进度显示在下方执行终端</span>
        <span className="grow" />
        <Button type="button" onClick={close}>
          关闭
        </Button>
      </div>
    </Modal>
  );
}
