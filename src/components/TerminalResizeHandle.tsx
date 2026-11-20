import { useRef } from 'react';
import { Button } from '../ui';

export function terminalHeight(value: number, viewport: number) {
  return Math.round(
    Math.max(80, Math.min(Number.isFinite(value) ? value : 140, Math.max(80, viewport - 280))),
  );
}
export function TerminalResizeHandle({
  height,
  onChange,
}: {
  height: number;
  onChange: (height: number) => void;
}) {
  const drag = useRef<{ y: number; height: number } | null>(null);
  const resize = (value: number) => onChange(terminalHeight(value, window.innerHeight));
  return (
    <Button
      type="button"
      className="terminal-resizer"
      role="separator"
      aria-label="调整日志区域高度"
      aria-orientation="horizontal"
      aria-valuemin={80}
      aria-valuemax={Math.max(80, window.innerHeight - 280)}
      aria-valuenow={height}
      title="上下拖动调整日志高度；双击恢复默认高度"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.focus();
        drag.current = { y: event.clientY, height };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current) resize(drag.current.height + drag.current.y - event.clientY);
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onDoubleClick={() => resize(140)}
      onKeyDown={(event) => {
        if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          resize(
            event.key === 'Home'
              ? 80
              : event.key === 'End'
                ? window.innerHeight - 280
                : height + (event.key === 'ArrowUp' ? 24 : -24),
          );
        }
      }}
    >
      <span />
    </Button>
  );
}
