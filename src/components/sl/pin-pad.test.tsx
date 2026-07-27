import { fireEvent, render } from '@testing-library/react-native';

import { PinPad } from './pin-pad';

describe('PinPad', () => {
  it('renders one filled dot per character in value', async () => {
    const { getByTestId } = await render(
      <PinPad value="12" length={6} onDigit={jest.fn()} onDelete={jest.fn()} />,
    );
    expect(getByTestId('pin-dot-0').props.style[1]).toMatchObject({ opacity: 1 });
    expect(getByTestId('pin-dot-5').props.style[1]).toMatchObject({ opacity: 0.2 });
  });

  it('calls onDigit with the pressed digit', async () => {
    const onDigit = jest.fn();
    const { getByTestId } = await render(
      <PinPad value="" length={6} onDigit={onDigit} onDelete={jest.fn()} />,
    );
    fireEvent.press(getByTestId('pin-digit-7'));
    expect(onDigit).toHaveBeenCalledWith('7');
  });

  it('calls onDelete when the delete key is pressed', async () => {
    const onDelete = jest.fn();
    const { getByTestId } = await render(
      <PinPad value="1" length={6} onDigit={jest.fn()} onDelete={onDelete} />,
    );
    fireEvent.press(getByTestId('pin-delete'));
    expect(onDelete).toHaveBeenCalled();
  });

  it('does not render a biometric key when onBiometricPress is not provided', async () => {
    const { queryByTestId } = await render(
      <PinPad value="" length={6} onDigit={jest.fn()} onDelete={jest.fn()} />,
    );
    expect(queryByTestId('pin-biometric')).toBeNull();
  });

  it('renders and wires the biometric key when onBiometricPress is provided', async () => {
    const onBiometricPress = jest.fn();
    const { getByTestId } = await render(
      <PinPad value="" length={6} onDigit={jest.fn()} onDelete={jest.fn()} onBiometricPress={onBiometricPress} />,
    );
    fireEvent.press(getByTestId('pin-biometric'));
    expect(onBiometricPress).toHaveBeenCalled();
  });

  it('ignores presses when disabled', async () => {
    const onDigit = jest.fn();
    const onDelete = jest.fn();
    const { getByTestId } = await render(
      <PinPad value="" length={6} onDigit={onDigit} onDelete={onDelete} disabled />,
    );
    fireEvent.press(getByTestId('pin-digit-3'));
    fireEvent.press(getByTestId('pin-delete'));
    expect(onDigit).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });
});
