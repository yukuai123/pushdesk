// A separate Node process keeps cwd, environment, and build dependencies isolated.
const fs = require('node:fs');
const { buildBundle } = require('./bundle.cjs');
(async () => {
  const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  process.chdir(input.cwd);
  const utils = require('@shm-open/code-push-cli/bin/lib/react-native-utils');
  const folder = await buildBundle(input, utils);
  console.log('构建完成：' + folder);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
