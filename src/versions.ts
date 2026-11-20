import type { Platform, Project, Rule, VersionRecord } from './api';
import { appName } from './platform';

export function versionRecords(project: Project): VersionRecord[] {
  const records = new Map<string, VersionRecord>();
  for (const rule of [...(project.versionRecords || []), ...project.rules])
    records.set(`${rule.deployment}:${rule.target}`, rule);
  return [...records.values()];
}
function quote(value: string) {
  return /^[a-zA-Z0-9_./:@=-]+$/.test(value) ? value : JSON.stringify(value);
}
export function releaseCommand(
  project: Project,
  rule: Rule,
  platform: Platform,
  description = '',
  mandatory = true,
) {
  const args = [
    'code-push',
    'release-react',
    appName(project, platform),
    platform,
    '--deploymentName',
    rule.deployment,
    '-t',
    rule.target,
    '--mandatory',
    String(mandatory),
    '--reset-cache',
  ];
  if (description.trim()) args.push('--des', description.trim());
  return args.map(quote).join(' ');
}
