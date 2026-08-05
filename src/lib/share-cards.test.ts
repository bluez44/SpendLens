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

import type { Txn } from './transactions';
import { assembleRecapData, assembleStreakData } from './share-cards';

const REG = [
  { id: 'food', label: 'Food', color: '#f00' },
  { id: 'fun', label: 'Fun', color: '#0f0' },
  { id: 'bills', label: 'Bills', color: '#00f' },
  { id: 'transport', label: 'Transport', color: '#ff0' },
];

function mkAssemblyTxn(date: string, amount: number, category: string, id: number): Txn {
  return {
    id, uuid: `u${id}`, updatedAt: 0,
    date, time: '10:00', createdAt: 0,
    category: category as Txn['category'], name: 't', note: null,
    amount, currency: 'VND',
    originalAmount: amount, originalCurrency: 'VND',
    isIncome: false, photoPath: null, subscriptionUuid: null,
  };
}

// Wednesday of a Monday-starting week (2026-08-03 = Monday)
const WEDNESDAY = new Date(2026, 7, 5, 12, 0, 0);

describe('assembleRecapData', () => {
  it('returns zeroed data for empty txns with narrative=another_log', () => {
    const r = assembleRecapData([], REG, 0, 'VND', WEDNESDAY);
    expect(r.totalExpense).toBe(0);
    expect(r.totalIncome).toBe(0);
    expect(r.topCategories).toEqual([]);
    expect(r.budgetPctUsed).toBeNull();
    expect(r.narrative).toBe('another_log');
  });

  it('sums this-week expense and picks top 3 categories', () => {
    const txns = [
      mkAssemblyTxn('2026-08-04', 300, 'food', 1),
      mkAssemblyTxn('2026-08-05', 200, 'fun', 2),
      mkAssemblyTxn('2026-08-06', 100, 'bills', 3),
      mkAssemblyTxn('2026-08-07', 50, 'transport', 4),
    ];
    const r = assembleRecapData(txns, REG, 0, 'VND', WEDNESDAY);
    expect(r.totalExpense).toBe(650);
    expect(r.topCategories).toHaveLength(3);
    expect(r.topCategories[0].id).toBe('food');
    expect(r.topCategories[0].value).toBe(300);
    expect(r.topCategories[0].pctOfWeek).toBeCloseTo(46.15, 1);
  });

  it('computes budgetPctUsed proportional to week when budget > 0', () => {
    // monthlyBudget = 3000, week share = 3000 * 7/30 = 700, spend = 350 → 50%
    const txns = [mkAssemblyTxn('2026-08-04', 350, 'food', 1)];
    const r = assembleRecapData(txns, REG, 3000, 'VND', WEDNESDAY);
    expect(r.budgetPctUsed).toBeCloseTo(50, 0);
  });

  it('leaves budgetPctUsed null when monthlyBudget === 0', () => {
    const txns = [mkAssemblyTxn('2026-08-04', 100, 'food', 1)];
    const r = assembleRecapData(txns, REG, 0, 'VND', WEDNESDAY);
    expect(r.budgetPctUsed).toBeNull();
  });

  it('picks new_obsession narrative when this-week top differs from prev-week top', () => {
    const txns = [
      // prev week: food dominant
      mkAssemblyTxn('2026-07-28', 300, 'food', 1),
      mkAssemblyTxn('2026-07-29', 200, 'transport', 2),
      // this week: fun top but only 41% (below single_cat_focus 50% threshold),
      // total 600 vs prev 500 = +20% (below splurged 30% threshold)
      mkAssemblyTxn('2026-08-04', 250, 'fun', 3),
      mkAssemblyTxn('2026-08-05', 200, 'bills', 4),
      mkAssemblyTxn('2026-08-06', 150, 'food', 5),
    ];
    const r = assembleRecapData(txns, REG, 0, 'VND', WEDNESDAY);
    expect(r.topCategories[0].id).toBe('fun');
    expect(r.narrative).toBe('new_obsession');
  });
});

describe('assembleStreakData', () => {
  it('composes logDays + txnCountThisWeek + hype', () => {
    const txns = [
      mkAssemblyTxn('2026-08-05', 100, 'food', 1),
      mkAssemblyTxn('2026-08-04', 100, 'food', 2),
      mkAssemblyTxn('2026-08-03', 100, 'food', 3),
    ];
    const s = assembleStreakData(txns, WEDNESDAY);
    expect(s.logDays).toBe(3);
    expect(s.txnCountThisWeek).toBe(3);
    expect(s.hype).toBe('warming_up');
  });

  it('returns zeroed streak with just_started hype when txns empty', () => {
    const s = assembleStreakData([], WEDNESDAY);
    expect(s.logDays).toBe(0);
    expect(s.txnCountThisWeek).toBe(0);
    expect(s.hype).toBe('just_started');
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
