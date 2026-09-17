import type { Category } from './categories';
import { i18n } from './i18n';
import { txnTitle } from './txn-title';

beforeAll(async () => { await i18n.changeLanguage('vi'); });

const base = { name: 'Cà phê', note: null as string | null, category: 'food' as const, isIncome: false };

describe('txnTitle', () => {
  it('uses the name when present', () => {
    expect(txnTitle({ ...base, note: 'Latte' })).toBe('Cà phê');
  });

  it('falls back to the legacy note when the name is empty or whitespace', () => {
    expect(txnTitle({ ...base, name: '', note: 'Latte' })).toBe('Latte');
    expect(txnTitle({ ...base, name: '   ', note: 'Latte' })).toBe('Latte');
  });

  it('falls back to the static category label when name and note are empty', () => {
    expect(txnTitle({ ...base, name: '', note: '  ' })).toBe(i18n.t('category.food'));
  });

  it('resolves a custom category label through extras', () => {
    const gym: Category = { id: 'custom_1', labelKey: null, label: 'Gym', chip: '#eee', fg: '#333' };
    expect(txnTitle({ ...base, name: '', category: 'custom_1' }, [gym])).toBe('Gym');
  });

  it('uses the income label for income without text', () => {
    expect(txnTitle({ ...base, name: '', isIncome: true })).toBe(i18n.t('category.income'));
  });

  it('follows the current language', async () => {
    await i18n.changeLanguage('en');
    expect(txnTitle({ ...base, name: '' })).toBe('Food');
    await i18n.changeLanguage('vi');
  });
});
