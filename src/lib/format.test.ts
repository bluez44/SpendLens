import { i18n } from './i18n';
import {
  compactK,
  compactTr,
  dayLabel,
  formatCurrency,
  formatVND,
  monthKey,
  shiftDateKey,
  signedVND,
  toDateKey,
} from './format';

beforeEach(async () => { await i18n.changeLanguage('vi'); });

describe('formatCurrency', () => {
  it('formats with two decimals and thousands separators', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50');
    expect(formatCurrency(6.75)).toBe('$6.75');
  });
});

describe('formatVND', () => {
  it('groups thousands with dots and appends ₫', () => {
    expect(formatVND(45000)).toBe('45.000₫');
    expect(formatVND(2500000)).toBe('2.500.000₫');
    expect(formatVND(0)).toBe('0₫');
  });
});

describe('signedVND', () => {
  it('prefixes minus for expense and plus for income', () => {
    expect(signedVND(45000, false)).toBe('−45.000₫');
    expect(signedVND(2500000, true)).toBe('+2.500.000₫');
  });
});

describe('compact', () => {
  it('compactK rounds to thousands', () => {
    expect(compactK(730000)).toBe('730k');
    expect(compactK(2500000)).toBe('2.500k');
  });

  it('compactTr shows millions with a comma decimal', () => {
    expect(compactTr(4230000)).toBe('4,23tr');
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
    expect(dayLabel('2026-07-17', '2026-07-17')).toBe('Hôm nay');
    expect(dayLabel('2026-07-16', '2026-07-17')).toBe('Hôm qua');
  });

  it('labels older dates as "D ThM"', () => {
    expect(dayLabel('2026-07-10', '2026-07-17')).toBe('10 Th7');
  });
});

describe('monthKey', () => {
  it('extracts YYYY-MM', () => {
    expect(monthKey('2026-07-17')).toBe('2026-07');
  });
});
