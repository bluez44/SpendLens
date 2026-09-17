import { fireEvent, render } from '@testing-library/react-native';

import type { FrequentEntry } from '@/lib/frequent-entries';
import { i18n } from '@/lib/i18n';
import { SuggestionChips } from './suggestion-chips';

const entry: FrequentEntry = {
  name: 'Cà phê', category: 'food', originalAmount: 29000, originalCurrency: 'VND', count: 3, lastUsedAt: 1,
};

beforeAll(async () => { await i18n.changeLanguage('vi'); });

describe('SuggestionChips', () => {
  it('renders nothing without entries', async () => {
    const { toJSON } = await render(<SuggestionChips entries={[]} onPick={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  it('renders "name · compact amount" and reports the picked entry', async () => {
    const onPick = jest.fn();
    const { getByText } = await render(<SuggestionChips entries={[entry]} onPick={onPick} />);
    fireEvent.press(getByText('Cà phê · 29k'));
    expect(onPick).toHaveBeenCalledWith(entry);
  });

  it('labels each chip for screen readers', async () => {
    const { getByRole } = await render(<SuggestionChips entries={[entry]} onPick={jest.fn()} />);
    expect(getByRole('button', { name: i18n.t('a11y.suggestion', { note: 'Cà phê', amount: '29k' }) })).toBeTruthy();
  });
});
