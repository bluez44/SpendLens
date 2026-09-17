import en from './locales/en.json';
import vi from './locales/vi.json';

function keysOf(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === 'object'
      ? keysOf(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

const A11Y_KEYS = [
  'open_home', 'open_history', 'flash_on', 'flash_off', 'flip_camera',
  'capture', 'add_note', 'share_cards', 'back', 'edit_txn', 'open_txn',
  'add_subscription', 'confirm_category', 'choose_currency',
  'quick_add', 'pick_photo', 'edit_note', 'suggestion',
];

describe('locale files', () => {
  it('vi and en define exactly the same keys', () => {
    expect(keysOf(en).sort()).toEqual(keysOf(vi).sort());
  });

  it('define every accessibility label', () => {
    const viKeys = keysOf(vi);
    for (const k of A11Y_KEYS) expect(viKeys).toContain(`a11y.${k}`);
  });

  it('define the quick-add and toast strings', () => {
    const viKeys = keysOf(vi);
    for (const k of [
      'quick_add.title', 'quick_add.note_placeholder', 'quick_add.details',
      'toast.saved', 'toast.undo', 'toast.undone',
    ]) expect(viKeys).toContain(k);
  });
});
