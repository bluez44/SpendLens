import { shiftDateKey } from '@/lib/format';

import { activeQuick, firstOfMonth } from './date-range-sheet';

describe('activeQuick', () => {
  const today = '2026-07-24';

  it('matches thisMonth when from is first-of-month and to is today', () => {
    expect(activeQuick(firstOfMonth(today), today, today)).toBe('thisMonth');
  });

  it('matches lastMonth when from is 1st of last month and to is last day of last month', () => {
    expect(activeQuick('2026-06-01', '2026-06-30', today)).toBe('lastMonth');
  });

  it('matches threeMonths when from is today-90 and to is today', () => {
    expect(activeQuick(shiftDateKey(today, -90), today, today)).toBe('threeMonths');
  });

  it('matches all when from is 2000-01-01 and to is today', () => {
    expect(activeQuick('2000-01-01', today, today)).toBe('all');
  });

  it('returns null when from/to do not match any preset (custom range)', () => {
    expect(activeQuick('2026-07-10', '2026-07-15', today)).toBeNull();
  });
});
