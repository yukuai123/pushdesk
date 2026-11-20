import type { Rule } from './api';
export function productionRule(rule: Rule) {
  return (
    ['stable', 'gray'].includes(rule.lane) ||
    rule.deployment === 'Production' ||
    ['master', 'gray'].includes(rule.branch)
  );
}
export function requiresConfirmation(rule: Rule) {
  return productionRule(rule) || !['test', 'staging'].includes(rule.lane) || rule.confirm === true;
}
