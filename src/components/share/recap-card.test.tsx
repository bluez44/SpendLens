import { render } from '@testing-library/react-native';
import { RecapCard } from './recap-card';
import type { RecapData } from '@/lib/share-cards';

function mkRecap(overrides: Partial<RecapData> = {}): RecapData {
  return {
    weekStart: '2026-08-04',
    weekEnd: '2026-08-10',
    totalExpense: 1247,
    totalIncome: 0,
    topCategories: [
      { id: 'food', label: 'Food', color: '#f00', value: 500, pctOfWeek: 42 },
      { id: 'fun', label: 'Fun', color: '#0f0', value: 400, pctOfWeek: 30 },
      { id: 'transport', label: 'Transport', color: '#00f', value: 200, pctOfWeek: 18 },
    ],
    deltaExpensePct: 30,
    narrative: 'splurged',
    budgetPctUsed: 87,
    primary: 'USD',
    ...overrides,
  };
}

describe('RecapCard', () => {
  it('renders total, narrative, and 3 category rows when hideAmounts=false', async () => {
    const { queryByText } = await render(<RecapCard data={mkRecap()} hideAmounts={false} />);
    expect(queryByText(/1,247|1\.247|1 247|1247/)).toBeTruthy();
    expect(queryByText(/Food/)).toBeTruthy();
    expect(queryByText(/Fun/)).toBeTruthy();
    expect(queryByText(/Transport/)).toBeTruthy();
  });

  it('does NOT render the amount when hideAmounts=true and budget available', async () => {
    const { queryByText } = await render(<RecapCard data={mkRecap({ budgetPctUsed: 87 })} hideAmounts={true} />);
    expect(queryByText(/1,247|1\.247|1247/)).toBeNull();
    expect(queryByText(/87/)).toBeTruthy();
  });

  it('hides hero line entirely when hideAmounts=true and budgetPctUsed=null', async () => {
    const { queryByText } = await render(<RecapCard data={mkRecap({ budgetPctUsed: null })} hideAmounts={true} />);
    expect(queryByText(/1,247|1\.247|1247/)).toBeNull();
    expect(queryByText(/budget/i)).toBeNull();
  });

  it('does not render delta pill when deltaExpensePct is null', async () => {
    const { queryByText } = await render(<RecapCard data={mkRecap({ deltaExpensePct: null })} hideAmounts={false} />);
    expect(queryByText(/vs last week|so với tuần trước/i)).toBeNull();
  });

  it('renders defensively with fewer than 3 categories', async () => {
    const single = mkRecap({
      topCategories: [{ id: 'food', label: 'Food', color: '#f00', value: 100, pctOfWeek: 100 }],
    });
    const { queryByText } = await render(<RecapCard data={single} hideAmounts={false} />);
    expect(queryByText(/Food/)).toBeTruthy();
  });
});
