import { Button } from '../ui';
import { ChevronRight, Layers, Plus } from 'lucide-react';

export function Empty({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="empty panel">
      <span className="empty-icon">
        <Layers size={30} />
      </span>
      <h2>把第一个项目放进工作空间</h2>
      <p>绑定项目目录、发布分支与版本，让正式和灰度一目了然。</p>
      <Button className="primary" onClick={onAdd}>
        <Plus size={16} />
        添加项目
      </Button>
      <div className="empty-steps">
        <span>01 关联本地项目</span>
        <ChevronRight size={15} />
        <span>02 配置发布用途</span>
        <ChevronRight size={15} />
        <span>03 查询线上版本</span>
      </div>
    </div>
  );
}
