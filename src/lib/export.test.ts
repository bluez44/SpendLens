import { i18n } from './i18n';
import { buildTransactionsCsv } from './export';
import { toCategoryObj } from './user-categories';
import type { UserCategory } from './user-categories';

beforeAll(async () => { await i18n.changeLanguage('vi'); });

describe('buildTransactionsCsv', () => {
  it('starts with a UTF-8 BOM and header row', () => {
    const csv = buildTransactionsCsv([]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const [, header] = csv.split('\n');
    expect(header).toBeUndefined(); // no rows so no newline yet
    expect(csv.slice(1)).toBe('Date,Time,Category,Name,Amount,Type');
  });

  it('quotes fields with commas and doubles inner quotes', () => {
    const csv = buildTransactionsCsv([
      {
        id: 1, date: '2026-07-17', time: '8:00 AM', createdAt: 1, category: 'food',
        name: 'Coffee, Large', note: 'w/ "extra" shot', amount: 6.5, isIncome: false, photoPath: null,
      },
    ]);
    const lines = csv.slice(1).split('\n');
    expect(lines[1]).toBe('2026-07-17,8:00 AM,Ăn uống,"Coffee, Large",6.50,Expense');
  });

  it('labels income rows', () => {
    const csv = buildTransactionsCsv([
      { id: 1, date: '2026-07-17', time: '9:00 AM', createdAt: 1, category: 'other', name: 'Salary', note: '', amount: 2400, isIncome: true, photoPath: null },
    ]);
    expect(csv.slice(1).split('\n')[1]).toBe('2026-07-17,9:00 AM,Khác,Salary,2400.00,Income');
  });

  it('resolves custom category label from extras instead of falling back to Khác', () => {
    const gymUC: UserCategory = {
      id: 'custom_111_1' as UserCategory['id'],
      label: 'Gym',
      createdAt: 111,
    };
    const extras = [toCategoryObj(gymUC)];
    const csv = buildTransactionsCsv(
      [
        {
          id: 2, date: '2026-07-18', time: '07:00', createdAt: 2,
          category: 'custom_111_1', name: 'Monthly gym fee',
          note: null, amount: 300000, isIncome: false, photoPath: null,
        },
      ],
      extras,
    );
    expect(csv.slice(1).split('\n')[1]).toBe('2026-07-18,07:00,Gym,Monthly gym fee,300000.00,Expense');
  });
});
