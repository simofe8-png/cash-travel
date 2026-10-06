import { money } from '../../domain/money';
import { testServices } from '../../testing/services';
import { ORPHAN_GRACE_MS } from './ReceiptService';

function setup() {
  const s = testServices();
  s.clock.set('2026-11-03T05:00:00.000Z', 420);
  const tripId = s.tripService.createTrip({ name: 'T', startDate: '2026-11-01', endDate: '2026-11-10', reportingCurrency: 'ILS' }, [money(100000, 'THB')]);
  const tx = s.expenseService.addExpense({ tripId, amount: money(1000, 'THB'), categoryId: s.categories.getBuiltin('FOOD').id, payment: { method: 'CASH' } });
  const rows = () => s.db.all<{ transaction_id: number; file_name: string }>('SELECT transaction_id, file_name FROM receipts');
  return { ...s, tripId, tx, rows };
}

describe('Receipt lifecycle', () => {
  it('attach copies the photo into private storage and references it', async () => {
    const { receiptService, receiptStore, tx, rows } = setup();
    await receiptService.attach(tx, 'file:///cache/a.jpg');
    expect(rows()).toEqual([{ transaction_id: tx, file_name: 'r-test-1.jpg' }]);
    expect([...receiptStore.files.keys()]).toEqual(['r-test-1.jpg']);
    expect(receiptService.uriFor(tx)).toBe('file:///private/receipts/r-test-1.jpg');
  });

  it('replace keeps exactly one file: the new one', async () => {
    const { receiptService, receiptStore, tx, rows } = setup();
    await receiptService.attach(tx, 'file:///cache/a.jpg');
    await receiptService.attach(tx, 'file:///cache/b.jpg');
    expect(rows()).toEqual([{ transaction_id: tx, file_name: 'r-test-2.jpg' }]);
    expect([...receiptStore.files.keys()]).toEqual(['r-test-2.jpg']);
  });

  it('a failed DB write removes the newly copied file (no orphan)', async () => {
    const { receiptService, receiptStore, rows } = setup();
    await expect(receiptService.attach(9999, 'file:///cache/a.jpg')).rejects.toThrow(); // FK: no such transaction
    expect(rows()).toEqual([]);
    expect(receiptStore.files.size).toBe(0);
  });

  it('a failed copy writes no row', async () => {
    const { receiptService, receiptStore, tx, rows } = setup();
    receiptStore.failNextImport = true;
    await expect(receiptService.attach(tx, 'file:///cache/a.jpg')).rejects.toThrow('copy failed');
    expect(rows()).toEqual([]);
  });

  it('remove deletes row and file', async () => {
    const { receiptService, receiptStore, tx, rows } = setup();
    await receiptService.attach(tx, 'file:///cache/a.jpg');
    receiptService.remove(tx);
    expect(rows()).toEqual([]);
    expect(receiptStore.files.size).toBe(0);
    expect(receiptService.uriFor(tx)).toBeNull();
  });

  it('deleting the action deletes its receipt photo', async () => {
    const { receiptService, transactionService, receiptStore, tx, rows } = setup();
    await receiptService.attach(tx, 'file:///cache/a.jpg');
    transactionService.delete(tx);
    expect(rows()).toEqual([]);
    expect(receiptStore.files.size).toBe(0);
  });

  it('receipts never affect money', async () => {
    const { receiptService, ledger, tripId, tx, db } = setup();
    const before = { bal: ledger.balances(tripId), tx: db.all('SELECT * FROM transactions'), le: db.all('SELECT * FROM ledger_entries') };
    await receiptService.attach(tx, 'file:///cache/a.jpg');
    receiptService.remove(tx);
    expect({ bal: ledger.balances(tripId), tx: db.all('SELECT * FROM transactions'), le: db.all('SELECT * FROM ledger_entries') }).toEqual(before);
  });

  it('cleanup: old unreferenced files deleted, recent ones kept, dangling rows dropped, deleted-transaction receipts removed', async () => {
    const s = setup();
    const { receiptService, receiptStore, tx, rows, clock } = s;
    // A file left by a crash long ago, and one being attached right now.
    receiptStore.files.set('r-old.jpg', { from: 'x', modifiedMs: Date.parse(clock.now()) - ORPHAN_GRACE_MS - 1 });
    receiptStore.files.set('r-fresh.jpg', { from: 'x', modifiedMs: Date.parse(clock.now()) - 1000 });
    // A row whose file vanished.
    await receiptService.attach(tx, 'file:///cache/a.jpg');
    receiptStore.files.delete('r-test-1.jpg');
    // A receipt whose transaction was soft-deleted outside the service (e.g. crash before the hook ran).
    const other = s.expenseService.addExpense({ tripId: s.tripId, amount: money(5, 'THB'), categoryId: s.categories.getBuiltin('FOOD').id, payment: { method: 'CASH' } });
    await receiptService.attach(other, 'file:///cache/b.jpg');
    s.ledger.softDelete(other);

    const report = receiptService.cleanup();
    expect(report).toEqual({ orphanFilesDeleted: 1, deletedTransactionReceipts: 1, danglingRowsRemoved: 1 });
    expect([...receiptStore.files.keys()].sort()).toEqual(['r-fresh.jpg']);
    expect(rows()).toEqual([]);
  });

  it('capture goes through the camera port (permission only on demand)', async () => {
    const { receiptService, receiptCamera } = setup();
    expect(receiptCamera.calls).toBe(0);
    receiptCamera.next = { status: 'denied' };
    await expect(receiptService.capture()).resolves.toEqual({ status: 'denied' });
    expect(receiptCamera.calls).toBe(1);
  });
});
