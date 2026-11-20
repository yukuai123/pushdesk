import { Tag } from 'antd';
import { names } from '../api';
export function Badge({ lane }: { lane: string }) {
  return (
    <Tag bordered={false} className={'badge ' + lane}>
      <i />
      {names[lane] || '待标记'}
    </Tag>
  );
}
