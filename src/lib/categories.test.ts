import { i18n } from './i18n';
import { categoryLabel, categoryOf, STATIC_CATEGORIES } from './categories';

describe('STATIC_CATEGORIES', () => {
  it('exposes 7 static entries with unique ids', () => {
    expect(STATIC_CATEGORIES).toHaveLength(7);
    const ids = STATIC_CATEGORIES.map((c) => c.id);
    expect(new Set(ids).size).toBe(7);
  });
});

describe('categoryLabel', () => {
  beforeEach(async () => { await i18n.changeLanguage('vi'); });

  it('returns Vietnamese label for static categories', () => {
    const food = STATIC_CATEGORIES.find((c) => c.id === 'food')!;
    expect(categoryLabel(food)).toBe('Ăn uống');
  });

  it('returns user label for custom categories', () => {
    const custom = { id: 'custom_1' as const, labelKey: null, label: 'Gym', chip: '#F3F4F6', fg: '#6B7280' };
    expect(categoryLabel(custom)).toBe('Gym');
  });

  it('switches to English on language change', async () => {
    await i18n.changeLanguage('en');
    const food = STATIC_CATEGORIES.find((c) => c.id === 'food')!;
    expect(categoryLabel(food)).toBe('Food');
    await i18n.changeLanguage('vi');
  });
});

describe('categoryOf', () => {
  it('finds static by id', () => {
    expect(categoryOf('bills').id).toBe('bills');
  });

  it('falls back to other when unknown', () => {
    expect(categoryOf('does-not-exist').id).toBe('other');
  });

  it('finds custom via extras', () => {
    const extras = [
      { id: 'custom_9' as const, labelKey: null, label: 'X', chip: '#F3F4F6', fg: '#6B7280' },
    ];
    expect(categoryOf('custom_9', extras).id).toBe('custom_9');
  });
});
