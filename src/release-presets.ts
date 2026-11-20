import type { Rule } from './api';

// Selecting a purpose fills defaults; the fields stay editable afterwards.
export const releasePresets: Record<string, Pick<Rule, 'branch' | 'deployment' | 'envFile'>> = {
  test: { branch: 'test', deployment: 'Deployment', envFile: '.env.test' },
  staging: { branch: 'release', deployment: 'Staging', envFile: '.env.stage' },
  gray: { branch: 'gray', deployment: 'Production', envFile: '.env.production' },
  stable: { branch: 'master', deployment: 'Production', envFile: '.env.production' },
};
