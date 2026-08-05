import { render } from '@testing-library/react-native';
import { StreakCard } from './streak-card';

describe('StreakCard', () => {
  it('renders logDays prominently', async () => {
    const { queryByText } = await render(
      <StreakCard data={{ logDays: 5, txnCountThisWeek: 12, hype: 'warming_up' }} />
    );
    expect(queryByText('5')).toBeTruthy();
  });

  it('renders defensively for logDays=0', async () => {
    const { queryByText } = await render(
      <StreakCard data={{ logDays: 0, txnCountThisWeek: 0, hype: 'just_started' }} />
    );
    expect(queryByText('0')).toBeTruthy();
  });

  it('renders txnCountThisWeek in micro-stat', async () => {
    const { queryByText } = await render(
      <StreakCard data={{ logDays: 3, txnCountThisWeek: 7, hype: 'warming_up' }} />
    );
    expect(queryByText(/7/)).toBeTruthy();
  });
});
