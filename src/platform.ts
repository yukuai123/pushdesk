import type { Platform, Project } from './api';

export const platformNames: Record<Platform, string> = { android: 'Android', ios: 'iOS' };
export const iosBuildDefaults = {
  entryFile: '',
  bundleName: 'main.jsbundle',
  podFile: 'ios/Podfile',
  hermes: 'auto' as const,
};
export function appName(project: Project, platform: Platform) {
  return platform === 'ios' ? project.ios?.app || '' : project.app;
}
export function historyKey(projectId: string, deployment: string, platform: Platform) {
  return platform === 'ios' ? `${projectId}:ios:${deployment}` : `${projectId}:${deployment}`;
}

export function deploymentTargets(project?: Project) {
  return [
    ...new Set([
      ...(project?.rules.map((rule) => rule.deployment) || []),
      'Production',
      'Staging',
      'Deployment',
    ]),
  ];
}
