import { categoryOf, CATEGORIES } from './categories';

describe('categoryOf', () => {
  it('returns the matching category', () => {
    expect(categoryOf('food').label).toBe('Ăn uống');
  });

  it('falls back to "other" for an unknown id', () => {
    expect(categoryOf('nonsense').id).toBe('other');
  });

  it('has exactly the 7 mockup categories', () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual([
      'food', 'transport', 'shopping', 'bills', 'health', 'fun', 'other',
    ]);
  });
});
