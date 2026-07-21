import { dayLabel, formatCurrency, monthKey, shiftDateKey, toDateKey } from './format';

describe('formatCurrency', () => {
  it('formats with two decimals and thousands separators', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
    expect(formatCurrency(6.75)).toBe('$6.75');
  });
});

describe('toDateKey', () => {
  it('formats a Date as YYYY-MM-DD', () => {
    expect(toDateKey(new Date(2026, 6, 17))).toBe('2026-07-17');
  });

  it('pads single-digit months and days', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('shiftDateKey', () => {
  it('shifts backward across a month boundary', () => {
    expect(shiftDateKey('2026-07-01', -1)).toBe('2026-06-30');
  });

  it('shifts forward', () => {
    expect(shiftDateKey('2026-07-17', 3)).toBe('2026-07-20');
  });
});

describe('dayLabel', () => {
  it('labels today and yesterday specially', () => {
    expect(dayLabel('2026-07-17', '2026-07-17')).toBe('Today');
    expect(dayLabel('2026-07-16', '2026-07-17')).toBe('Yesterday');
  });

  it('labels older dates as "Mon D"', () => {
    expect(dayLabel('2026-07-10', '2026-07-17')).toBe('Jul 10');
  });
});

describe('monthKey', () => {
  it('extracts YYYY-MM', () => {
    expect(monthKey('2026-07-17')).toBe('2026-07');
  });
});
