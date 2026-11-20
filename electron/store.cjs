const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');
class Store {
  async init(dir) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'pushdesk.sqlite');
    const SQL = await initSqlJs({ locateFile: (f) => require.resolve('sql.js/dist/' + f) });
    this.db = fs.existsSync(this.file)
      ? new SQL.Database(fs.readFileSync(this.file))
      : new SQL.Database();
    this.db.run('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.db.run('CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, value TEXT NOT NULL)');
    return this;
  }
  get(key, fallback) {
    const q = this.db.prepare('SELECT value FROM kv WHERE key=?');
    try {
      q.bind([key]);
      return q.step() ? JSON.parse(q.getAsObject().value) : fallback;
    } finally {
      q.free();
    }
  }
  put(key, value) {
    this.db.run('INSERT OR REPLACE INTO kv VALUES (?,?)', [key, JSON.stringify(value)]);
    this.flush();
  }
  tasks() {
    const q = this.db.prepare('SELECT value FROM tasks ORDER BY rowid DESC');
    const rows = [];
    try {
      while (q.step()) rows.push(JSON.parse(q.getAsObject().value));
      return rows;
    } finally {
      q.free();
    }
  }
  task(t) {
    this.db.run('INSERT OR REPLACE INTO tasks VALUES (?,?)', [t.id, JSON.stringify(t)]);
    this.flush();
  }
  flush() {
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, Buffer.from(this.db.export()), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }
}
module.exports = { Store };
