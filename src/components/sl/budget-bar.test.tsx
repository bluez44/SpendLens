import { render } from '@testing-library/react-native';

import { BudgetBar } from './budget-bar';

describe('BudgetBar', () => {
  it('renders the CTA when budget is 0', async () => {
    const { getByText } = await render(<BudgetBar spent={0} budget={0} currency="VND" onSetBudget={() => {}} />);
    expect(getByText(/Đặt ngân sách/)).toBeTruthy();
  });

  it('shows the percentage under 100 when within budget', async () => {
    const { getByText } = await render(<BudgetBar spent={1_500_000} budget={3_000_000} currency="VND" onSetBudget={() => {}} />);
    expect(getByText('50%')).toBeTruthy();
    expect(getByText('1.500.000₫ / 3.000.000₫')).toBeTruthy();
  });

  it('shows a true percentage over 100 when over budget', async () => {
    const { getByText } = await render(<BudgetBar spent={3_450_000} budget={3_000_000} currency="VND" onSetBudget={() => {}} />);
    expect(getByText('115%')).toBeTruthy();
  });

  it('formats spent and budget in the given non-VND currency', async () => {
    const { getByText } = await render(<BudgetBar spent={1500} budget={3000} currency="USD" onSetBudget={() => {}} />);
    expect(getByText('$1500.00 / $3000.00')).toBeTruthy();
  });
});
