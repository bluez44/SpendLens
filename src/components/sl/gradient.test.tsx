import { fireEvent, render } from '@testing-library/react-native';

import { Shutter } from './gradient';

describe('Shutter', () => {
  it('is exposed as a labelled button', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(<Shutter onPress={onPress} accessibilityLabel="Chụp ảnh" />);
    fireEvent.press(getByRole('button', { name: 'Chụp ảnh' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
