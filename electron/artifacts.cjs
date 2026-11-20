const fs = require('node:fs');
const path = require('node:path');
const yazl = require('yazl');
const C = require('./core.cjs');

async function zipDir(dir, file) {
  const z = new yazl.ZipFile();
  function walk(d, relative = '') {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = path.posix.join(relative, e.name);
      C.assert(!e.isSymbolicLink(), '构建产物不能包含符号链接');
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else z.addFile(path.join(d, e.name), r);
    }
  }
  walk(dir);
  await new Promise((res, rej) => {
    const out = fs.createWriteStream(file);
    out.on('close', res);
    out.on('error', rej);
    z.outputStream.on('error', rej).pipe(out);
    z.end();
  });
}
module.exports = { zipDir };
