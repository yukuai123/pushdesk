import semver from 'semver';
export const uid = () => crypto.randomUUID();
export const date = (value: number) => new Date(value).toLocaleString('zh-CN', { hour12: false });
export const size = (bytes = 0) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
export function matches(v: string, range: string) {
  // UI matching uses the same semver library as the execution layer.
  try {
    return semver.satisfies(v, range);
  } catch {
    return false;
  }
}
