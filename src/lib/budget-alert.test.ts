import { decideBudgetAlert } from './budget-alert';

describe('decideBudgetAlert', () => {
  const base = { budget: 100, notifiedMonth: '', currentMonth: '2026-07' };

  it('returns null when budget is 0', () => {
    expect(decideBudgetAlert({ ...base, budget: 0, spent: 999 })).toBe(null);
  });

  it('returns null when spent < 80%', () => {
    expect(decideBudgetAlert({ ...base, spent: 79 })).toBe(null);
  });

  it('returns 80 at exactly 80%', () => {
    expect(decideBudgetAlert({ ...base, spent: 80 })).toBe(80);
  });

  it('returns 100 at exactly 100%', () => {
    expect(decideBudgetAlert({ ...base, spent: 100 })).toBe(100);
  });

  it('does not re-fire 80 in same month after 80 already fired', () => {
    expect(decideBudgetAlert({ ...base, spent: 85, notifiedMonth: '2026-07:80' })).toBe(null);
  });

  it('fires 100 in same month even after 80 already fired', () => {
    expect(decideBudgetAlert({ ...base, spent: 105, notifiedMonth: '2026-07:80' })).toBe(100);
  });

  it('does not re-fire 100 in same month after 100 already fired', () => {
    expect(decideBudgetAlert({ ...base, spent: 120, notifiedMonth: '2026-07:100' })).toBe(null);
  });

  it('does not fire 80 in same month after 100 already fired', () => {
    expect(decideBudgetAlert({ ...base, spent: 85, notifiedMonth: '2026-07:100' })).toBe(null);
  });

  it('fires again in a new month', () => {
    expect(decideBudgetAlert({ ...base, spent: 85, notifiedMonth: '2026-06:100', currentMonth: '2026-07' })).toBe(80);
  });
});
