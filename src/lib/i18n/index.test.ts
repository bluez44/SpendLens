import { i18n } from './index';

describe('i18n', () => {
  it('initialises with vietnamese by default and returns known keys', () => {
    expect(i18n.language).toBe('vi');
    expect(i18n.t('app.name')).toBe('SpendLens');
    expect(i18n.t('day.today')).toBe('Hôm nay');
    expect(i18n.t('category.food')).toBe('Ăn uống');
  });

  it('swaps translations after changeLanguage', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('day.today')).toBe('Today');
    expect(i18n.t('category.food')).toBe('Food');
    await i18n.changeLanguage('vi');
    expect(i18n.t('day.today')).toBe('Hôm nay');
  });

  it('missing key returns the key itself (returnNull=false)', () => {
    expect(i18n.t('does.not.exist')).toBe('does.not.exist');
  });

  it('resolves the share namespace in both languages', () => {
    expect(i18n.t('share.sheet_title')).toBe('Chia sẻ giao dịch');
    expect(i18n.t('share.share_btn')).toBe('Chia sẻ');
  });
});
