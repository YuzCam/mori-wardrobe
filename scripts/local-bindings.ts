/** Development-only Node adapters. Never included in the production Worker. */
import { DatabaseSync } from 'node:sqlite';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  existsSync,
  writeFileSync,
  createReadStream,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
const root = join(process.cwd(), '.sites-runtime', 'node-preview');
mkdirSync(root, { recursive: true });
const connection = new DatabaseSync(join(root, 'wardrobe.sqlite'));
connection.exec(
  'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)',
);
for (const name of readdirSync(join(process.cwd(), 'drizzle'))
  .filter((n) => n.endsWith('.sql'))
  .sort()) {
  if (connection.prepare('SELECT name FROM local_migrations WHERE name=?').get(name)) continue;
  connection.exec('BEGIN');
  try {
    connection.exec(readFileSync(join(process.cwd(), 'drizzle', name), 'utf8'));
    connection.prepare('INSERT INTO local_migrations(name) VALUES(?)').run(name);
    connection.exec('COMMIT');
  } catch (e) {
    connection.exec('ROLLBACK');
    throw e;
  }
}
function statement(sql: string, args: any[] = []): any {
  const runSync = () => {
    const result = connection.prepare(sql).run(...args);
    return {
      success: true,
      results: [],
      meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) },
    };
  };
  return {
    bind: (...values: any[]) => statement(sql, values),
    runSync,
    run: async () => runSync(),
    all: async () => ({ success: true, results: connection.prepare(sql).all(...args), meta: {} }),
    first: async (column?: string) => {
      const row = connection.prepare(sql).get(...args) as any;
      return column ? (row?.[column] ?? null) : (row ?? null);
    },
    raw: async () =>
      connection
        .prepare(sql)
        .all(...args)
        .map((row) => Object.values(row)),
  };
}
const DB = {
  prepare: (sql: string) => statement(sql),
  batch: async (statements: any[]) => {
    connection.exec('BEGIN');
    try {
      const values = statements.map((s) => s.runSync());
      connection.exec('COMMIT');
      return values;
    } catch (e) {
      connection.exec('ROLLBACK');
      throw e;
    }
  },
  exec: async (sql: string) => {
    connection.exec(sql);
    return { count: 1, duration: 0 };
  },
};
const bucketRoot = join(root, 'bucket');
mkdirSync(bucketRoot, { recursive: true });
const keyPath = (key: string) => join(bucketRoot, createHash('sha256').update(key).digest('hex'));
const BUCKET = {
  put: async (key: string, value: ReadableStream, options: any) => {
    const bytes = new Uint8Array(await new Response(value).arrayBuffer());
    const path = keyPath(key);
    writeFileSync(path, bytes);
    writeFileSync(path + '.meta', JSON.stringify(options?.httpMetadata ?? {}));
    return { key, size: bytes.length };
  },
  get: async (key: string) => {
    const path = keyPath(key);
    if (!existsSync(path)) return null;
    return {
      key,
      body: Readable.toWeb(createReadStream(path)),
      httpMetadata: JSON.parse(readFileSync(path + '.meta', 'utf8')),
    };
  },
  delete: async (key: string) => {
    for (const path of [keyPath(key), keyPath(key) + '.meta'])
      if (existsSync(path)) unlinkSync(path);
  },
};
export const env = { DB, BUCKET };
