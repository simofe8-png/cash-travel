// Migration 0003 (trip documents): upgrade from schema v2 keeps existing data; constraints hold.
import { NodeSqliteDatabase } from '../../testing/NodeSqliteDatabase';
import { migrate } from './migrate';
import { MIGRATIONS } from './migrations';

const T = '2026-10-09T10:00:00.000Z';
const doc = (fields: Record<string, string | number>) => {
  const base: Record<string, string | number> = { trip_id: 1, file_name: 'd-a.pdf', original_name: 'a.pdf', display_name: 'a', mime_type: 'application/pdf', size_bytes: 10, created_at: T, ...fields };
  const cols = Object.keys(base);
  return [`INSERT INTO trip_documents (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => base[c]!)] as const;
};

function v2WithTrip() {
  const db = new NodeSqliteDatabase();
  migrate(db, MIGRATIONS.slice(0, 2), () => T);
  db.run(`INSERT INTO trips (id, name, start_date, end_date, created_at, updated_at) VALUES (1, 'Rome', '2026-11-01', '2026-11-10', ?, ?)`, [T, T]);
  return db;
}

describe('migration 0003 trip_documents', () => {
  it('upgrades a v2 database without touching existing rows', () => {
    const db = v2WithTrip();
    const before = db.all('SELECT * FROM trips');
    expect(migrate(db, MIGRATIONS, () => T).applied).toEqual([3]);
    expect(db.all('SELECT * FROM trips')).toEqual(before);
    expect(db.all('SELECT * FROM trip_documents')).toEqual([]);
    expect(db.all('PRAGMA foreign_key_check')).toEqual([]);
  });

  it('enforces trip reference, safe file names, supported types and a non-empty name', () => {
    const db = v2WithTrip();
    migrate(db, MIGRATIONS, () => T);
    db.run(...doc({}));
    expect(() => db.run(...doc({ file_name: 'd-b.pdf', trip_id: 99 }))).toThrow(/FOREIGN KEY/);
    expect(() => db.run(...doc({ file_name: '../x.pdf' }))).toThrow(/CHECK/);
    expect(() => db.run(...doc({ file_name: `a${String.fromCharCode(92)}b.pdf` }))).toThrow(/CHECK/);
    expect(() => db.run(...doc({ file_name: 'd-a.pdf' }))).toThrow(/UNIQUE/);
    expect(() => db.run(...doc({ file_name: 'd-c.gif', mime_type: 'image/gif' }))).toThrow(/CHECK/);
    expect(() => db.run(...doc({ file_name: 'd-d.pdf', display_name: '  ' }))).toThrow(/CHECK/);
    // A trip with documents cannot be deleted behind the service's back.
    expect(() => db.run('DELETE FROM trips WHERE id = 1')).toThrow(/FOREIGN KEY/);
  });
});
