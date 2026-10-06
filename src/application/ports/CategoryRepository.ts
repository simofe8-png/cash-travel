import type { Category } from '../../domain/expense';

export interface CategoryRepository {
  /** Active categories: built-ins and non-archived custom ones, in display order. */
  listActive(): Category[];
  get(id: number): Category | undefined;
  getBuiltin(key: string): Category;
  createCustom(name: string, icon: string): number;
  renameCustom(id: number, name: string, icon: string): void;
  archiveCustom(id: number): void;
  /** Ids of active (non-deleted) transactions using the category. */
  activeTransactionIds(categoryId: number): number[];
}
