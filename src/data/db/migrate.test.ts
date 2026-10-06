import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NodeSqliteDatabase } from '../../testing/NodeSqliteDatabase';
import { currentSchemaVersion, migrate, MigrationError, type Migration } from './migrate';
import { inTransaction } from './transaction';

const now = () => '2026-10-06T10:00:00.000Z';

const m1: Migration = {
  version: 1,
  name: 'create_parent',
  up: (db) => db.exec('CREATE TABLE parent (id INTEGER PRIMARY KEY, name TEXT NOT NULL) STRICT'),
};
const m2: Migration = {
  version: 2,
  name: 'create_child',
  up: (db) =>
    db.exec(
      'CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id)) STRICT',
    ),
};
const failingM3: Migration = {
  version: 3,
  name: 'broken',
  up: (db) => {
    db.exec('CREATE TABLE half_done (id INTEGER PRIMARY KEY)');
    db.exec('ALTER TABLE parent ADD COLUMN extra TEXT');
    throw new Error('boom');
  },
};

function tables(db: NodeSqliteDatabase): string[] {
  return db
    .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .map((r) => r.name);
}

describe('migration runner', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ct-mig-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('clean install applies all migrations in order and records them', () => {
    const db = new NodeSqliteDatabase();
    const report = migrate(db, [m1, m2], now);
    expect(report).toEqual({ from: 0, to: 2, applied: [1, 2] });
    expect(tables(db)).toEqual(expect.arrayContaining(['parent', 'child', 'schema_migrations']));
    expect(db.all('SELECT version, name, applied_at FROM schema_migrations ORDER BY version')).toEqual([
      { version: 1, name: 'create_parent', applied_at: now() },
      { version: 2, name: 'create_child', applied_at: now() },
    ]);
  });

  it('repeat startup is idempotent and preserves data (file DB reopened)', () => {
    const path = join(dir, 'app.db');
    let db = new NodeSqliteDatabase(path);
    migrate(db, [m1, m2], now);
    db.run('INSERT INTO parent (id, name) VALUES (1, ?)', ['kept']);
    db.close();

    db = new NodeSqliteDatabase(path);
    expect(migrate(db, [m1, m2], now)).toEqual({ from: 2, to: 2, applied: [] });
    expect(db.get('SELECT name FROM parent WHERE id = 1')).toEqual({ name: 'kept' });
    db.close();
  });

  it('upgrade from an earlier schema applies only pending migrations', () => {
    const path = join(dir, 'app.db');
    let db = new NodeSqliteDatabase(path);
    migrate(db, [m1], now);
    db.run('INSERT INTO parent (id, name) VALUES (7, ?)', ['v1 data']);
    db.close();

    db = new NodeSqliteDatabase(path);
    expect(migrate(db, [m1, m2], now)).toEqual({ from: 1, to: 2, applied: [2] });
    expect(db.get('SELECT name FROM parent WHERE id = 7')).toEqual({ name: 'v1 data' });
    db.close();
  });

  it('a failing migration rolls back completely and keeps prior data', () => {
    const path = join(dir, 'app.db');
    let db = new NodeSqliteDatabase(path);
    migrate(db, [m1, m2], now);
    db.run('INSERT INTO parent (id, name) VALUES (1, ?)', ['survivor']);

    expect(() => migrate(db, [m1, m2, failingM3], now)).toThrow(MigrationError);
    expect(currentSchemaVersion(db)).toBe(2);
    expect(tables(db)).not.toContain('half_done');
    expect(db.all("SELECT name FROM pragma_table_info('parent')").map((r: any) => r.name)).toEqual(['id', 'name']);
    expect(db.get('SELECT COUNT(*) AS n FROM schema_migrations')).toEqual({ n: 2 });
    db.close();

    // After the fix ships, the same database upgrades normally.
    db = new NodeSqliteDatabase(path);
    const fixedM3: Migration = { version: 3, name: 'fixed', up: (d) => d.exec('ALTER TABLE parent ADD COLUMN extra TEXT') };
    expect(migrate(db, [m1, m2, fixedM3], now).applied).toEqual([3]);
    expect(db.get('SELECT name FROM parent WHERE id = 1')).toEqual({ name: 'survivor' });
    db.close();
  });

  it('refuses to touch a database newer than the app (downgrade)', () => {
    const db = new NodeSqliteDatabase();
    migrate(db, [m1, m2], now);
    expect(() => migrate(db, [m1], now)).toThrow(/newer than this app/);
    expect(currentSchemaVersion(db)).toBe(2);
  });

  it('rejects gaps or misordered migration lists', () => {
    const db = new NodeSqliteDatabase();
    expect(() => migrate(db, [m2], now)).toThrow(/numbered/);
    expect(() => migrate(db, [m1, { ...m2, version: 3 }], now)).toThrow(/numbered/);
  });

  it('enforces foreign keys on every connection', () => {
    const db = new NodeSqliteDatabase();
    migrate(db, [m1, m2], now);
    expect(() => db.run('INSERT INTO child (id, parent_id) VALUES (1, 999)')).toThrow(/FOREIGN KEY/);
  });
});

describe('inTransaction', () => {
  function setup() {
    const db = new NodeSqliteDatabase();
    migrate(db, [m1, m2], now);
    return db;
  }
  const count = (db: NodeSqliteDatabase) => db.get<{ n: number }>('SELECT COUNT(*) AS n FROM parent')!.n;

  it('commits all writes together', () => {
    const db = setup();
    inTransaction(db, () => {
      db.run("INSERT INTO parent (name) VALUES ('a')");
      db.run("INSERT INTO parent (name) VALUES ('b')");
    });
    expect(count(db)).toBe(2);
  });

  it('rolls back every write when any statement fails (all or nothing)', () => {
    const db = setup();
    expect(() =>
      inTransaction(db, () => {
        db.run("INSERT INTO parent (id, name) VALUES (1, 'a')");
        db.run('INSERT INTO child (id, parent_id) VALUES (1, 1)');
        db.run('INSERT INTO child (id, parent_id) VALUES (2, 404)'); // FK violation
      }),
    ).toThrow();
    expect(count(db)).toBe(0);
    expect(db.get('SELECT COUNT(*) AS n FROM child')).toEqual({ n: 0 });
  });

  it('rolls back on an application error thrown mid-transaction', () => {
    const db = setup();
    expect(() =>
      inTransaction(db, () => {
        db.run("INSERT INTO parent (name) VALUES ('a')");
        throw new Error('invariant violated');
      }),
    ).toThrow('invariant violated');
    expect(count(db)).toBe(0);
  });

  it('nested failure caught inside the outer unit rolls back only the inner part', () => {
    const db = setup();
    inTransaction(db, () => {
      db.run("INSERT INTO parent (name) VALUES ('outer')");
      try {
        inTransaction(db, () => {
          db.run("INSERT INTO parent (name) VALUES ('inner')");
          throw new Error('inner fails');
        });
      } catch {
        // handled
      }
    });
    expect(db.all('SELECT name FROM parent')).toEqual([{ name: 'outer' }]);
  });

  it('rejects async callbacks (atomicity cannot span awaits)', () => {
    const db = setup();
    expect(() => inTransaction(db, (async () => undefined) as unknown as () => void)).toThrow(/synchronous/);
    // The connection is usable afterwards (no dangling transaction).
    inTransaction(db, () => db.run("INSERT INTO parent (name) VALUES ('ok')"));
    expect(count(db)).toBe(1);
  });
});
