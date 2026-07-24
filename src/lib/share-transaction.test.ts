import { categoryOf } from './categories';
import { i18n } from './i18n';
import { buildShareOverlay, DEFAULT_SHARE_TOGGLES, shareTransactionImage } from './share-transaction';
import type { ShareToggles } from './share-transaction';
import type { Txn } from './transactions';

jest.mock('react-native-share', () => ({
  __esModule: true,
  default: { open: jest.fn().mockResolvedValue(undefined) },
}));

import Share from 'react-native-share';

beforeAll(async () => { await i18n.changeLanguage('vi'); });

const baseTxn: Txn = {
  id: 1, date: '2026-07-24', time: '14:30', createdAt: 1,
  category: 'food', name: 'Cà phê', note: 'Latte size L',
  amount: 45000, isIncome: false, photoPath: '/tmp/photo.jpg',
};

const foodCategory = categoryOf('food');

describe('buildShareOverlay', () => {
  it('includes all four fields when every toggle is on', () => {
    const overlay = buildShareOverlay(baseTxn, DEFAULT_SHARE_TOGGLES, foodCategory, '2026-07-24');
    expect(overlay).toEqual({
      categoryText: 'Ăn uống',
      amountText: '−45.000₫',
      nameText: 'Latte size L',
      dateText: 'Hôm nay · 14:30',
    });
  });

  it('nulls out amountText when showAmount is off', () => {
    const toggles: ShareToggles = { ...DEFAULT_SHARE_TOGGLES, showAmount: false };
    const overlay = buildShareOverlay(baseTxn, toggles, foodCategory, '2026-07-24');
    expect(overlay.amountText).toBeNull();
    expect(overlay.categoryText).toBe('Ăn uống');
  });

  it('nulls out categoryText when showCategory is off', () => {
    const toggles: ShareToggles = { ...DEFAULT_SHARE_TOGGLES, showCategory: false };
    const overlay = buildShareOverlay(baseTxn, toggles, foodCategory, '2026-07-24');
    expect(overlay.categoryText).toBeNull();
  });

  it('nulls out dateText when showDate is off', () => {
    const toggles: ShareToggles = { ...DEFAULT_SHARE_TOGGLES, showDate: false };
    const overlay = buildShareOverlay(baseTxn, toggles, foodCategory, '2026-07-24');
    expect(overlay.dateText).toBeNull();
  });

  it('falls back to txn.name for nameText when note is null', () => {
    const toggles: ShareToggles = { ...DEFAULT_SHARE_TOGGLES };
    const overlay = buildShareOverlay({ ...baseTxn, note: null }, toggles, foodCategory, '2026-07-24');
    expect(overlay.nameText).toBe('Cà phê');
  });

  it('nulls out nameText when showName is off', () => {
    const toggles: ShareToggles = { ...DEFAULT_SHARE_TOGGLES, showName: false };
    const overlay = buildShareOverlay(baseTxn, toggles, foodCategory, '2026-07-24');
    expect(overlay.nameText).toBeNull();
  });

  it('prefixes income with a plus sign', () => {
    const overlay = buildShareOverlay({ ...baseTxn, isIncome: true }, DEFAULT_SHARE_TOGGLES, foodCategory, '2026-07-24');
    expect(overlay.amountText).toBe('+45.000₫');
  });
});

describe('shareTransactionImage', () => {
  beforeEach(() => (Share.open as jest.Mock).mockClear());

  it('opens the OS share sheet with a file:// URL, image/png type, and failOnCancel: false', async () => {
    await shareTransactionImage('/tmp/cache/story.png');
    expect(Share.open).toHaveBeenCalledWith({
      url: 'file:///tmp/cache/story.png',
      type: 'image/png',
      failOnCancel: false,
      useInternalStorage: true,
    });
  });

  it('does not double-prefix a URI that already starts with file://', async () => {
    await shareTransactionImage('file:///tmp/cache/story.png');
    expect(Share.open).toHaveBeenCalledWith(expect.objectContaining({
      url: 'file:///tmp/cache/story.png',
    }));
  });
});
