import { Alert, Empty as AntEmpty, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { History, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import {
  names,
  type Platform,
  type Project,
  type Release,
  type State,
  type VersionUpdate,
} from '../api';
import { Badge } from '../components/Badge';
import { Empty } from '../components/Empty';
import { ReleaseVersionCard } from '../components/ReleaseVersionCard';
import { deploymentTargets, historyKey, appName } from '../platform';
import { Button, Input, Select } from '../ui';
import { date, matches } from '../utils';
import { versionRecords, sourceBranch } from '../versions';

type Props = {
  project?: Project;
  platform?: Platform;
  deployment?: string;
  onDeploymentChange?: (value: string) => void;
  historyLoading?: boolean;
  historyError?: string;
  state: State;
  filter: string;
  setFilter: (value: string) => void;
  laneFilter: string;
  setLaneFilter: (value: string) => void;
  busy: boolean;
  onRefresh: () => void;
  onEdit: (project: Project | null) => void;
  onPublish: (ruleId?: string) => void;
  onUpdateVersion?: (input: VersionUpdate) => Promise<unknown>;
};
type HistoryRow = Release & { deployment: string };
export function Overview({
  project,
  platform = 'android',
  deployment,
  onDeploymentChange,
  historyLoading = false,
  historyError = '',
  state,
  filter,
  setFilter,
  laneFilter,
  setLaneFilter,
  busy,
  onRefresh,
  onEdit,
  onPublish,
  onUpdateVersion = async () => {
    throw new Error('请在桌面应用中修改版本');
  },
}: Props) {
  const targets = deploymentTargets(project);
  const activeDeployment = deployment || targets[0];
  const cache = project
    ? state.histories[historyKey(project.id, activeDeployment, platform)]
    : null;
  const items = historyLoading || historyError ? [] : cache?.items || [];
  const records = project ? versionRecords(project) : [];
  function recordedBranch(row: HistoryRow) {
    return project
      ? sourceBranch(row, state.tasks || [], {
          projectId: project.id,
          platform,
          deployment: row.deployment,
          app: appName(project, platform),
        })
      : undefined;
  }
  function metadata(row: HistoryRow) {
    const branch = recordedBranch(row);
    return records.filter(
      (record) =>
        record.deployment === row.deployment &&
        matches(record.target, row.appVersion) &&
        (!branch || record.branch === branch),
    );
  }
  const rows: HistoryRow[] = items
    .map((item) => ({ ...item, deployment: activeDeployment }))
    .filter((row) =>
      (
        row.label +
        row.appVersion +
        (recordedBranch(row) || '') +
        row.description +
        metadata(row)
          .map((record) => record.tag || '')
          .join(' ')
      )
        .toLowerCase()
        .includes(filter.toLowerCase()),
    )
    .filter(
      (row) =>
        laneFilter === 'all' ||
        (laneFilter === 'unknown'
          ? metadata(row).length === 0
          : metadata(row).some((record) => record.lane === laneFilter)),
    )
    .sort((a, b) => b.uploadTime - a.uploadTime);
  const columns: ColumnsType<HistoryRow> = [
    {
      title: '包版本 / 热更新',
      key: 'version',
      width: 130,
      render: (_, row) => (
        <div>
          <strong className="mono">{row.appVersion}</strong>
          <div className="muted tiny mono">{row.label}</div>
        </div>
      ),
    },
    {
      title: '来源分支',
      key: 'sourceBranch',
      width: 140,
      render: (_, row) => recordedBranch(row) || <span className="muted tiny">分支未记录</span>,
    },
    {
      title: '备注标签',
      key: 'tag',
      width: 130,
      render: (_, row) =>
        [
          ...new Set(
            metadata(row)
              .map((record) => record.tag)
              .filter(Boolean),
          ),
        ].map((tag) => <Tag key={tag}>{tag}</Tag>),
    },
    {
      title: '发布用途',
      key: 'lane',
      width: 130,
      render: (_, row) => {
        const lanes = [...new Set(metadata(row).map((record) => record.lane))];
        return lanes.length ? (
          <div className="table-badges">
            {lanes.map((lane) => (
              <Badge key={lane} lane={lane} />
            ))}
            {lanes.length > 1 && (
              <Typography.Text type="danger">分支未记录，匹配多个用途</Typography.Text>
            )}
          </div>
        ) : (
          <Button type="button" className="text-button" onClick={() => onEdit(project!)}>
            待标记 · 关联版本
          </Button>
        );
      },
    },
    { title: '部署目标', dataIndex: 'deployment', width: 110 },
    {
      title: '更新说明',
      key: 'description',
      width: 220,
      render: (_, row) => (
        <div className="description">
          {row.description.split('\n[PushDesk:')[0] || '未填写'}
          {row.isMandatory && <div className="muted tiny">强制更新</div>}
        </div>
      ),
    },
    {
      title: '发布时间',
      key: 'time',
      width: 150,
      render: (_, row) => <span className="muted tiny">{date(row.uploadTime)}</span>,
    },
    {
      title: '状态',
      key: 'status',
      width: 100,
      render: (_, row) => (
        <Tag color={row.isDisabled ? 'default' : 'green'}>
          {row.isDisabled ? '已禁用' : row.rollout < 100 ? `${row.rollout}% 灰度比例` : '可下载'}
        </Tag>
      ),
    },
  ];
  if (!project) return <Empty onAdd={() => onEdit(null)} />;
  return (
    <>
      <div className="section-title">
        <h2>
          发布版本 <Tag>{project.rules.length}</Tag>
        </h2>
        <Button type="button" disabled={busy || historyLoading} onClick={onRefresh}>
          <RefreshCw size={14} className={historyLoading ? 'spin' : ''} />
          刷新线上数据
        </Button>
      </div>
      <div className="lane-grid">
        {project.rules.map((rule) => (
          <ReleaseVersionCard
            key={rule.id}
            projectId={project.id}
            platform={platform}
            tasks={state.tasks || []}
            app={appName(project, platform)}
            rule={rule}
            cache={state.histories[historyKey(project.id, rule.deployment, platform)]}
            busy={busy}
            onSave={onUpdateVersion}
            onPublish={onPublish}
          />
        ))}
      </div>
      <div className="section-title history-title">
        <h2>
          服务端发布历史
          <Select
            className="deployment-select"
            aria-label="部署目标"
            value={activeDeployment}
            onChange={(event) => onDeploymentChange?.(event.target.value)}
          >
            {targets.map((target) => (
              <option key={target} value={target}>
                {target}
              </option>
            ))}
          </Select>
        </h2>
        <div className="table-tools">
          <div className="search">
            <Search size={14} />
            <Input
              aria-label="搜索版本"
              placeholder="搜索版本、分支、标签、说明"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </div>
          <Select
            aria-label="筛选发布用途"
            value={laneFilter}
            onChange={(event) => setLaneFilter(event.target.value)}
          >
            <option value="all">全部用途</option>
            {Object.entries(names).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
            <option value="unknown">待标记</option>
          </Select>
        </div>
      </div>
      {historyError && (
        <Alert
          type="error"
          showIcon
          message={historyError}
          action={
            <Button type="button" onClick={onRefresh}>
              重试查询
            </Button>
          }
          className="history-error"
        />
      )}
      <Table<HistoryRow>
        size="small"
        columns={columns}
        dataSource={rows}
        rowKey={(row) => row.deployment + ':' + row.label}
        loading={historyLoading}
        scroll={{ x: 970 }}
        pagination={rows.length > 10 ? { pageSize: 10, showSizeChanger: false } : false}
        locale={{
          emptyText: (
            <AntEmpty
              image={AntEmpty.PRESENTED_IMAGE_SIMPLE}
              description={
                historyLoading
                  ? '正在查询 ' + activeDeployment
                  : historyError
                    ? '本次查询失败'
                    : cache
                      ? '该部署目标暂无匹配记录'
                      : '等待查询 ' + activeDeployment
              }
            />
          ),
        }}
      />
      {!historyLoading && !historyError && cache && (
        <p className="history-updated">
          {activeDeployment} · 最近查询 {date(cache.time)}
        </p>
      )}
      <p className="footnote">
        <ShieldCheck size={14} />
        配置按版本号 +
        分支管理。同一应用和部署目标下，相同版本的客户端会匹配最新有效更新，分支不参与客户端分流。
      </p>
    </>
  );
}
