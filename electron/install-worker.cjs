const { spawn } = require('node:child_process');
const { installCommand, nodeEnvironment } = require('./runtime.cjs');
const { displayCommand } = require('./core.cjs');
try {
  const node = process.env.PUSHDESK_NODE_EXECUTABLE || process.execPath;
  const command = installCommand(process.argv[2] === 'yarn' ? 'yarn' : 'npm', node, process.cwd());
  console.log('$ ' + displayCommand(command.executable, command.args));
  const child = spawn(command.executable, command.args, {
    env: nodeEnvironment(node),
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  });
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code === null ? 1 : code;
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
