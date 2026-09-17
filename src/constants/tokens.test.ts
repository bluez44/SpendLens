import { AccentGradient, IncomeGradient, Money, OnPhoto } from './tokens';

describe('design tokens', () => {
  it('exposes semantic money and status colours', () => {
    expect(Money.expense).toBe('#FB5B4D');
    expect(Money.income).toBe('#34C79A');
    expect(Money.warning).toBe('#F59E0B');
    expect(Money.incomeChip).toBe('#D1FAE5');
  });

  it('exposes gradients', () => {
    expect(AccentGradient).toEqual(['#FFB37B', '#FF6B6B']);
    expect(IncomeGradient).toEqual(['#34C79A', '#1FA07A']);
  });

  it('exposes theme-independent text colours for photo overlays', () => {
    expect(OnPhoto.text).toBe('#fff');
    expect(OnPhoto.textSecondary).toBe('rgba(255,255,255,0.78)');
  });
});
