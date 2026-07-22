export type CategoryId = 'food' | 'transport' | 'shopping' | 'bills' | 'health' | 'fun' | 'other';

export interface Category {
  id: CategoryId;
  label: string;
  chip: string;
  fg: string;
}

export const CATEGORIES: Category[] = [
  { id: 'food', label: 'Ăn uống', chip: '#FFEDD5', fg: '#EA580C' },
  { id: 'transport', label: 'Di chuyển', chip: '#DBEAFE', fg: '#2563EB' },
  { id: 'shopping', label: 'Mua sắm', chip: '#EDE9FE', fg: '#7C3AED' },
  { id: 'bills', label: 'Hóa đơn', chip: '#FEF3C7', fg: '#D97706' },
  { id: 'health', label: 'Sức khỏe', chip: '#CCFBF1', fg: '#0D9488' },
  { id: 'fun', label: 'Giải trí', chip: '#FCE7F3', fg: '#DB2777' },
  { id: 'other', label: 'Khác', chip: '#F3F4F6', fg: '#6B7280' },
];

/** Label shown for income transactions (tracked via is_income, not a category). */
export const INCOME_LABEL = 'Thu nhập';

export function categoryOf(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}
