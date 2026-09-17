import { fireEvent, render } from '@testing-library/react-native';

import { QuickAmountChips } from './quick-amount-chips';

describe('QuickAmountChips', () => {
  it('renders VND presets and reports the picked amount', async () => {
    const onPick = jest.fn();
    const { getByText } = await render(<QuickAmountChips currency="VND" onPick={onPick} />);
    for (const label of ['20k', '50k', '100k', '200k']) expect(getByText(label)).toBeTruthy();
    fireEvent.press(getByText('50k'));
    expect(onPick).toHaveBeenCalledWith(50000);
  });

  it('renders nothing for currencies without presets', async () => {
    const { toJSON } = await render(<QuickAmountChips currency="USD" onPick={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });
});
