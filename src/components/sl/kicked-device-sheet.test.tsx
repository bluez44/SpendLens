import { render, fireEvent } from '@testing-library/react-native';
import { KickedDeviceSheet } from './kicked-device-sheet';

describe('KickedDeviceSheet', () => {
  it('renders nothing when not visible', async () => {
    const { queryByTestId } = await render(<KickedDeviceSheet visible={false} onChoice={() => {}} />);
    expect(queryByTestId('kicked-keep')).toBeNull();
  });

  it('invokes onChoice("keep")', async () => {
    const onChoice = jest.fn();
    const { getByTestId } = await render(<KickedDeviceSheet visible onChoice={onChoice} />);
    fireEvent.press(getByTestId('kicked-keep'));
    expect(onChoice).toHaveBeenCalledWith('keep');
  });
});
