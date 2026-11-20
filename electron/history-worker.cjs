// Execute the bundled CLI's parser and history command; inject credentials only in memory.
const SDK = require('code-push');
const { createRequire } = require('node:module');
let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', async () => {
  try {
    const { token, url } = JSON.parse(input);
    const executor = require('@shm-open/code-push-cli/bin/command-executor');
    executor.sdk = new SDK(token, { 'X-CodePush-CLI-Version': '2.6.5' }, url);
    // Yargs otherwise treats a packaged Electron binary as a GUI app and keeps the script path.
    const cliRequire = createRequire(require.resolve('@shm-open/code-push-cli/bin/command-parser'));
    cliRequire('yargs')(process.argv.slice(2));
    const { command } = require('@shm-open/code-push-cli/bin/command-parser');
    const types = require('@shm-open/code-push-cli/bin/definitions/cli');
    if (
      !command ||
      command.type !== types.CommandType.deploymentHistory ||
      command.format !== 'json'
    )
      throw new Error('只允许查询 JSON 发布历史');
    await executor.execute(command);
  } catch (error) {
    process.stderr.write(
      '\nPUSHDESK_ERROR ' +
        JSON.stringify({ error: error.message || String(error), status: error.statusCode }) +
        '\n',
    );
    process.exitCode = 1;
  }
});
