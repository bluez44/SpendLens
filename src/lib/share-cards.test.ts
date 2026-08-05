import { pickNarrative, pickHype, type RecapData } from './share-cards';

function baseRecap(overrides: Partial<RecapData> = {}): RecapData {
  return {
    weekStart: '2026-08-04',
    weekEnd: '2026-08-10',
    totalExpense: 500,
    totalIncome: 0,
    topCategories: [
      { id: 'food', label: 'Food', color: '#f00', value: 200, pctOfWeek: 40 },
      { id: 'fun', label: 'Fun', color: '#0f0', value: 200, pctOfWeek: 40 },
      { id: 'bills', label: 'Bills', color: '#00f', value: 100, pctOfWeek: 20 },
    ],
    deltaExpensePct: 0,
    narrative: 'another_log',
    budgetPctUsed: 50,
    primary: 'VND',
    ...overrides,
  };
}

describe('pickNarrative', () => {
  it('priority 1: blew_budget when budgetPctUsed > 100', () => {
    const r = baseRecap({ budgetPctUsed: 150, deltaExpensePct: 200 });
    expect(pickNarrative(r, null)).toBe('blew_budget');
  });

  it('priority 2: splurged when deltaExpensePct > 30 and under budget', () => {
    const r = baseRecap({ budgetPctUsed: 40, deltaExpensePct: 45 });
    expect(pickNarrative(r, null)).toBe('splurged');
  });

  it('priority 3: locked_in when deltaExpensePct < -20 and not budget-blowing', () => {
    const r = baseRecap({ budgetPctUsed: 30, deltaExpensePct: -25 });
    expect(pickNarrative(r, null)).toBe('locked_in');
  });

  it('priority 4: under_budget_hero when budgetPctUsed < 70 and no delta drama', () => {
    const r = baseRecap({ budgetPctUsed: 50, deltaExpensePct: 5 });
    expect(pickNarrative(r, null)).toBe('under_budget_hero');
  });

  it('priority 5: single_cat_focus when top category > 50%', () => {
    const r = baseRecap({
      budgetPctUsed: null,
      deltaExpensePct: 0,
      topCategories: [
        { id: 'food', label: 'Food', color: '#f00', value: 600, pctOfWeek: 60 },
        { id: 'fun', label: 'Fun', color: '#0f0', value: 400, pctOfWeek: 40 },
      ],
    });
    expect(pickNarrative(r, null)).toBe('single_cat_focus');
  });

  it('priority 6: new_obsession when top category shifted vs previous week', () => {
    const r = baseRecap({ budgetPctUsed: null, deltaExpensePct: 0 });
    expect(pickNarrative(r, 'transport')).toBe('new_obsession');
  });

  it('priority 6: no new_obsession when top matches previous', () => {
    const r = baseRecap({ budgetPctUsed: null, deltaExpensePct: 0 });
    expect(pickNarrative(r, 'food')).toBe('another_log');
  });

  it('fallback: another_log when nothing else fires', () => {
    const r = baseRecap({ budgetPctUsed: null, deltaExpensePct: 0 });
    expect(pickNarrative(r, null)).toBe('another_log');
  });

  it('gracefully handles empty topCategories', () => {
    const r = baseRecap({
      budgetPctUsed: null,
      deltaExpensePct: 0,
      topCategories: [],
    });
    expect(pickNarrative(r, null)).toBe('another_log');
  });
});

describe('pickHype', () => {
  it('returns just_started for 0', () => {
    expect(pickHype(0)).toBe('just_started');
  });

  it('returns just_started for 1-2', () => {
    expect(pickHype(1)).toBe('just_started');
    expect(pickHype(2)).toBe('just_started');
  });

  it('returns warming_up for 3-6', () => {
    expect(pickHype(3)).toBe('warming_up');
    expect(pickHype(6)).toBe('warming_up');
  });

  it('returns locked_in_streak for 7-13', () => {
    expect(pickHype(7)).toBe('locked_in_streak');
    expect(pickHype(13)).toBe('locked_in_streak');
  });

  it('returns on_a_roll for 14-29', () => {
    expect(pickHype(14)).toBe('on_a_roll');
    expect(pickHype(29)).toBe('on_a_roll');
  });

  it('returns unstoppable for >= 30', () => {
    expect(pickHype(30)).toBe('unstoppable');
    expect(pickHype(100)).toBe('unstoppable');
  });
});
