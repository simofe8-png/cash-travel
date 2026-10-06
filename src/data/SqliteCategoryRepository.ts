import type { CategoryRepository } from '../application/ports/CategoryRepository';
import type { SqlDatabase } from '../application/ports/SqlDatabase';
import type { BuiltinCategoryKey, Category } from '../domain/expense';

interface Row {
  id: number;
  builtin_key: BuiltinCategoryKey | null;
  name: string | null;
  icon: string;
  sort_order: number;
  archived_at: string | null;
}

const toCategory = (r: Row): Category => ({
  id: r.id,
  builtinKey: r.builtin_key,
  name: r.name,
  icon: r.icon,
  sortOrder: r.sort_order,
  archived: r.archived_at !== null,
});

export class SqliteCategoryRepository implements CategoryRepository {
  constructor(
    private readonly db: SqlDatabase,
    private readonly now: () => string,
  ) {}

  listActive(): Category[] {
    return this.db.all<Row>('SELECT * FROM categories WHERE archived_at IS NULL ORDER BY sort_order, id').map(toCategory);
  }

  get(id: number): Category | undefined {
    const r = this.db.get<Row>('SELECT * FROM categories WHERE id = ?', [id]);
    return r ? toCategory(r) : undefined;
  }

  getBuiltin(key: string): Category {
    const r = this.db.get<Row>('SELECT * FROM categories WHERE builtin_key = ?', [key]);
    if (!r) throw new Error(`Built-in category ${key} missing`);
    return toCategory(r);
  }

  createCustom(name: string, icon: string): number {
    return this.db.run('INSERT INTO categories (name, icon, sort_order, created_at) VALUES (?, ?, 50, ?)', [name.trim(), icon, this.now()])
      .lastInsertRowId;
  }

  renameCustom(id: number, name: string, icon: string): void {
    const n = this.db.run('UPDATE categories SET name = ?, icon = ? WHERE id = ? AND builtin_key IS NULL AND archived_at IS NULL', [
      name.trim(),
      icon,
      id,
    ]).changes;
    if (n !== 1) throw new Error('Only active custom categories can be renamed');
  }

  archiveCustom(id: number): void {
    const n = this.db.run('UPDATE categories SET archived_at = ? WHERE id = ? AND builtin_key IS NULL AND archived_at IS NULL', [this.now(), id])
      .changes;
    if (n !== 1) throw new Error('Only active custom categories can be deleted');
  }

  activeTransactionIds(categoryId: number): number[] {
    return this.db
      .all<{ id: number }>('SELECT id FROM transactions WHERE category_id = ? AND deleted_at IS NULL ORDER BY id', [categoryId])
      .map((r) => r.id);
  }
}
