export type CategoryId = 'food' | 'transport' | 'shopping' | 'bills' | 'health' | 'fun' | 'other';

export interface Category {
  id: CategoryId;
  label: string;
  chip: string;
  fg: string;
}

export const CATEGORIES: Category[] = [
  { id: 'food', label: 'Food', chip: '#FFEDD5', fg: '#EA580C' },
  { id: 'transport', label: 'Transport', chip: '#DBEAFE', fg: '#2563EB' },
  { id: 'shopping', label: 'Shopping', chip: '#EDE9FE', fg: '#7C3AED' },
  { id: 'bills', label: 'Bills', chip: '#FEF3C7', fg: '#D97706' },
  { id: 'health', label: 'Health', chip: '#CCFBF1', fg: '#0D9488' },
  { id: 'fun', label: 'Entertainment', chip: '#FCE7F3', fg: '#DB2777' },
  { id: 'other', label: 'Other', chip: '#F3F4F6', fg: '#6B7280' },
];

export function categoryOf(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}
