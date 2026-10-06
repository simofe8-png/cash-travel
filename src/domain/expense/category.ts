export const BUILTIN_CATEGORY_KEYS = ['FOOD', 'ACCOMMODATION', 'TRANSPORT', 'ENTERTAINMENT', 'SHOPPING', 'OTHER'] as const;
export type BuiltinCategoryKey = (typeof BUILTIN_CATEGORY_KEYS)[number];

/** Icons a custom category may use (rendered by the UI icon set). */
export const CATEGORY_ICONS = ['tag', 'food', 'bed', 'bus', 'ticket', 'bag', 'gift', 'heart', 'phone', 'coffee', 'beach', 'dots'] as const;

export interface Category {
  readonly id: number;
  /** Set for built-ins; the UI shows the Hebrew label for the key. */
  readonly builtinKey: BuiltinCategoryKey | null;
  /** Set for custom categories. */
  readonly name: string | null;
  readonly icon: string;
  readonly sortOrder: number;
  readonly archived: boolean;
}

export const CATEGORY_NAME_MAX = 40;

export type CategoryViolation = 'NAME_REQUIRED' | 'NAME_TOO_LONG' | 'INVALID_ICON';

export function validateCustomCategory(name: string, icon: string): CategoryViolation[] {
  const v: CategoryViolation[] = [];
  const n = name.trim();
  if (n.length === 0) v.push('NAME_REQUIRED');
  if (n.length > CATEGORY_NAME_MAX) v.push('NAME_TOO_LONG');
  if (!(CATEGORY_ICONS as readonly string[]).includes(icon)) v.push('INVALID_ICON');
  return v;
}
