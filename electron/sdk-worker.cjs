const SDK = require('code-push');
let raw = '';
process.stdin.on('data', (b) => (raw += b));
process.stdin.on('end', async () => {
  try {
    const { token, url, method, args } = JSON.parse(raw);
    const sdk = new SDK(token, { 'X-CodePush-CLI-Version': '2.6.5' }, url);
    const data = await sdk[method](...args);
    process.stdout.write(JSON.stringify({ ok: true, data }));
  } catch (e) {
    process.stdout.write(
      JSON.stringify({ ok: false, error: e.message || String(e), status: e.statusCode }),
    );
    process.exitCode = 1;
  }
});
