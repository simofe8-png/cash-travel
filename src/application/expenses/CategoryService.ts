import { validateCustomCategory, type Category, type CategoryViolation } from '../../domain/expense';
import type { CategoryRepository } from '../ports/CategoryRepository';
import type { LedgerRepository } from '../ports/LedgerRepository';
import type { UnitOfWork } from '../ports/UnitOfWork';

export class CategoryError extends Error {
  constructor(readonly violations: readonly (CategoryViolation | 'DUPLICATE_NAME' | 'INVALID_TARGET' | 'NOT_CUSTOM')[]) {
    super(`Category error: ${violations.join(', ')}`);
    this.name = 'CategoryError';
  }
}

export class CategoryService {
  constructor(
    private readonly categories: CategoryRepository,
    private readonly ledger: LedgerRepository,
    private readonly uow: UnitOfWork,
  ) {}

  list(): Category[] {
    return this.categories.listActive();
  }

  get(id: number): Category | undefined {
    return this.categories.get(id);
  }

  createCustom(name: string, icon = 'tag'): number {
    this.validate(name, icon, null);
    return this.categories.createCustom(name, icon);
  }

  renameCustom(id: number, name: string, icon: string): void {
    this.validate(name, icon, id);
    this.categories.renameCustom(id, name, icon);
  }

  usageCount(id: number): number {
    return this.categories.activeTransactionIds(id).length;
  }

  /**
   * Deletes a custom category. Expenses using it are first reassigned (default: Other) through the
   * Ledger Engine — each reassignment is an auditable revision — then the category is archived.
   */
  deleteCustom(id: number, reassignTo?: number): void {
    const cat = this.categories.get(id);
    if (!cat || cat.builtinKey !== null || cat.archived) throw new CategoryError(['NOT_CUSTOM']);
    const target = reassignTo === undefined ? this.categories.getBuiltin('OTHER') : this.categories.get(reassignTo);
    if (!target || target.archived || target.id === id) throw new CategoryError(['INVALID_TARGET']);
    this.uow.run(() => {
      for (const txId of this.categories.activeTransactionIds(id)) {
        const stored = this.ledger.get(txId)!;
        if (stored.draft.type !== 'EXPENSE') continue;
        this.ledger.revise(txId, { ...stored.draft, categoryId: target.id }, stored.cardCharge);
      }
      this.categories.archiveCustom(id);
    });
  }

  private validate(name: string, icon: string, selfId: number | null): void {
    const v: (CategoryViolation | 'DUPLICATE_NAME')[] = validateCustomCategory(name, icon);
    const n = name.trim();
    if (this.categories.listActive().some((c) => c.name === n && c.id !== selfId)) v.push('DUPLICATE_NAME');
    if (v.length) throw new CategoryError(v);
  }
}
