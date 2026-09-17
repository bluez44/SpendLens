import { quickAmountsFor } from './quick-amounts';

describe('quickAmountsFor', () => {
  it('returns VND presets', () => {
    expect(quickAmountsFor('VND')).toEqual([20000, 50000, 100000, 200000]);
  });

  it('returns nothing for other currencies', () => {
    expect(quickAmountsFor('USD')).toEqual([]);
    expect(quickAmountsFor('JPY')).toEqual([]);
  });
});
