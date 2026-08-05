import { i18n } from './i18n';
import {
  compactK,
  compactTr,
  dayLabel,
  formatCurrency,
  formatVND,
  monthKey,
  shiftDateKey,
  shiftMonthKey,
  signedVND,
  toDateKey,
  formatMoney,
  signedMoney,
  formatCompact,
  formatAmountInput,
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

  it('labels older dates as "D ThM" (VI)', () => {
    expect(dayLabel('2026-07-10', '2026-07-17')).toBe('10 Th7');
  });

  it('labels older dates as "D MM" in EN locale', async () => {
    await i18n.changeLanguage('en');
    expect(dayLabel('2026-07-10', '2026-07-17')).toBe('10 M7');
    await i18n.changeLanguage('vi');
  });
});

describe('monthKey', () => {
  it('extracts YYYY-MM', () => {
    expect(monthKey('2026-07-17')).toBe('2026-07');
  });
});

describe('shiftMonthKey', () => {
  it('shifts backward within a year', () => {
    expect(shiftMonthKey('2026-08', -1)).toBe('2026-07');
    expect(shiftMonthKey('2026-08', -3)).toBe('2026-05');
  });

  it('rolls year backward when month goes below January', () => {
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2026-02', -3)).toBe('2025-11');
  });

  it('shifts forward across year boundary', () => {
    expect(shiftMonthKey('2026-11', 3)).toBe('2027-02');
  });

  it('year-over-year with -12 stays in the same month', () => {
    expect(shiftMonthKey('2026-08', -12)).toBe('2025-08');
    expect(shiftMonthKey('2026-02', -12)).toBe('2025-02');
  });

  it('day-of-month irrelevance — Feb → prior month never produces Feb 31', () => {
    // shifting from March back one month should give February, not "Feb 31 = Mar 3"
    expect(shiftMonthKey('2026-03', -1)).toBe('2026-02');
  });
});

describe('formatMoney', () => {
  it('VND: 45000 → "45.000₫"', () => {
    expect(formatMoney(45000, 'VND')).toBe('45.000₫');
  });
  it('USD: 20 → "$20.00"', () => {
    expect(formatMoney(20, 'USD')).toBe('$20.00');
  });
  it('USD: 20.5 → "$20.50"', () => {
    expect(formatMoney(20.5, 'USD')).toBe('$20.50');
  });
  it('JPY: 3000 → "¥3000" (no decimals, prefix)', () => {
    expect(formatMoney(3000, 'JPY')).toBe('¥3000');
  });
  it('KRW: 50000 → "₩50000"', () => {
    expect(formatMoney(50000, 'KRW')).toBe('₩50000');
  });
});

describe('signedMoney', () => {
  it('income → "+"', () => {
    expect(signedMoney(20, 'USD', true)).toBe('+$20.00');
  });
  it('expense → U+2212 minus', () => {
    expect(signedMoney(20, 'USD', false)).toBe('−$20.00');
  });
});

describe('formatCompact', () => {
  it('VND uses tr for millions', () => {
    expect(formatCompact(4_230_000, 'VND')).toBe('4,23tr');
  });
  it('VND uses k for thousands', () => {
    expect(formatCompact(485_000, 'VND')).toBe('485k');
  });
  it('USD passes through formatMoney', () => {
    expect(formatCompact(20, 'USD')).toBe('$20.00');
  });
});

describe('formatAmountInput', () => {
  it('VND: digits with thousand separators', () => {
    expect(formatAmountInput('485000', 'VND')).toBe('485.000');
  });
  it('VND: empty stays empty', () => {
    expect(formatAmountInput('', 'VND')).toBe('');
  });
  it('USD: treats digits as cents', () => {
    expect(formatAmountInput('12345', 'USD')).toBe('123.45');
  });
  it('USD: pads leading zeros for cents', () => {
    expect(formatAmountInput('5', 'USD')).toBe('0.05');
  });
  it('JPY (decimals=0): digits as int', () => {
    expect(formatAmountInput('3000', 'JPY')).toBe('3000');
  });
});
