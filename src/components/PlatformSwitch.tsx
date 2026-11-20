import { Button } from '../ui';
import type { Platform } from '../api';
import { platformNames } from '../platform';

export function PlatformSwitch({
  value,
  onChange,
}: {
  value: Platform;
  onChange: (platform: Platform) => void;
}) {
  return (
    <div className="platform-switch" role="group" aria-label="发布平台">
      {(['android', 'ios'] as const).map((platform) => (
        <Button
          type="button"
          key={platform}
          aria-pressed={value === platform}
          className={value === platform ? 'selected' : ''}
          onClick={() => onChange(platform)}
        >
          {platformNames[platform]}
        </Button>
      ))}
    </div>
  );
}
