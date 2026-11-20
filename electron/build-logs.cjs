const { randomUUID } = require('node:crypto');

// Keep full build output for diagnosis while exposing commands and stage changes separately.
async function runBuildStage(title, run, log) {
  const groupId = randomUUID();
  let pending = '';
  const stage = (status, text, kind) => log(text, kind, { groupId, stage: { title, status } });
  function line(text) {
    if (!text.trim()) return;
    const clean = text.replace(/\x1b\[[0-9;]*m/g, '');
    log(clean, clean.startsWith('$ ') ? 'command' : 'output', { groupId, groupTitle: title });
  }
  function flush() {
    if (pending) line(pending);
    pending = '';
  }
  function onLog(text, kind) {
    if (kind === 'command') {
      flush();
      log(text, kind, { groupId, groupTitle: title });
      return;
    }
    const lines = (pending + text).split(/\r\n|\n|\r/);
    pending = lines.pop();
    for (const text of lines) line(text);
  }
  stage('running', title + ' · 进行中', 'progress');
  try {
    const result = await run(onLog);
    flush();
    stage('success', title + ' · 已完成', 'success');
    return result;
  } catch (error) {
    flush();
    line(error.message);
    stage('error', title + ' · 失败', 'error');
    throw error;
  }
}
function appendLog(rows, row, limit = 1500) {
  rows.push(row);
  if (rows.length > limit) {
    const detail = rows.findIndex((item) => item.groupId && !item.stage && item.kind === 'output');
    rows.splice(detail < 0 ? 0 : detail, 1);
  }
}
module.exports = { runBuildStage, appendLog };
