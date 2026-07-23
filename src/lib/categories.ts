import { i18n } from './i18n';

export type StaticCategoryId = 'food' | 'transport' | 'shopping' | 'bills' | 'health' | 'fun' | 'other';
export type CustomCategoryId = `custom_${string}`;
export type CategoryId = StaticCategoryId | CustomCategoryId;

export interface Category {
  id: CategoryId;
  labelKey: string | null;   // 'category.food' etc.; null for user-defined
  label: string;             // used when labelKey is null (user categories)
  chip: string;
  fg: string;
}

export const STATIC_CATEGORIES: Category[] = [
  { id: 'food', labelKey: 'category.food', label: '', chip: '#FFEDD5', fg: '#EA580C' },
  { id: 'transport', labelKey: 'category.transport', label: '', chip: '#DBEAFE', fg: '#2563EB' },
  { id: 'shopping', labelKey: 'category.shopping', label: '', chip: '#EDE9FE', fg: '#7C3AED' },
  { id: 'bills', labelKey: 'category.bills', label: '', chip: '#FEF3C7', fg: '#D97706' },
  { id: 'health', labelKey: 'category.health', label: '', chip: '#CCFBF1', fg: '#0D9488' },
  { id: 'fun', labelKey: 'category.fun', label: '', chip: '#FCE7F3', fg: '#DB2777' },
  { id: 'other', labelKey: 'category.other', label: '', chip: '#F3F4F6', fg: '#6B7280' },
];

/** Key for the income "category" label (used at the display layer). */
export const INCOME_LABEL_KEY = 'category.income';

export function categoryLabel(c: Category): string {
  return c.labelKey ? i18n.t(c.labelKey) : c.label;
}

/**
 * Look up a category by id. Falls back to 'other' if not found.
 * Pass user categories via `extras` when they are relevant to the caller.
 */
export function categoryOf(id: string, extras: Category[] = []): Category {
  const all = [...STATIC_CATEGORIES, ...extras];
  return all.find((c) => c.id === id) ?? STATIC_CATEGORIES[STATIC_CATEGORIES.length - 1];
}
