function productionRule(rule) {
  return (
    ['stable', 'gray'].includes(rule.lane) ||
    rule.deployment === 'Production' ||
    ['master', 'gray'].includes(rule.branch)
  );
}
function requiresConfirmation(rule) {
  return productionRule(rule) || !['test', 'staging'].includes(rule.lane) || rule.confirm === true;
}
function quickRules(project) {
  return project.rules.filter(
    (rule) =>
      ['test', 'staging'].includes(rule.lane) &&
      ['test', 'release'].includes(rule.branch) &&
      !productionRule(rule),
  );
}
function checkPublishConfirmation(task, currentRule, { automatic, confirmation }) {
  if (requiresConfirmation(task.rule) || requiresConfirmation(currentRule)) {
    if (automatic || confirmation !== task.projectName)
      throw new Error('生产、灰度或已开启确认的版本必须二次确认后发布');
  }
}
module.exports = { productionRule, requiresConfirmation, quickRules, checkPublishConfirmation };
