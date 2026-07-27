import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AppLockProvider, useAppLock } from './app-lock-context';

function Probe() {
  const { isLocked, unlock } = useAppLock();
  return (
    <>
      <Text testID="locked">{String(isLocked)}</Text>
      <Text testID="unlock" onPress={unlock}>
        unlock
      </Text>
    </>
  );
}

describe('AppLockProvider — disabled', () => {
  it('never locks', async () => {
    const { getByTestId } = await render(
      <AppLockProvider enabled={false}>
        <Probe />
      </AppLockProvider>,
    );
    expect(getByTestId('locked').props.children).toBe('false');
  });
});

describe('AppLockProvider — enabled', () => {
  it('starts locked (cold start requires unlock)', async () => {
    const { getByTestId } = await render(
      <AppLockProvider enabled>
        <Probe />
      </AppLockProvider>,
    );
    expect(getByTestId('locked').props.children).toBe('true');
  });

  it('unlock() clears the lock and does not re-lock on its own', async () => {
    const { getByTestId } = await render(
      <AppLockProvider enabled>
        <Probe />
      </AppLockProvider>,
    );
    await act(() => {
      getByTestId('unlock').props.onPress();
    });
    expect(getByTestId('locked').props.children).toBe('false');
  });

  it('unlocks when the enabled prop flips to false', async () => {
    const { getByTestId, rerender } = await render(
      <AppLockProvider enabled>
        <Probe />
      </AppLockProvider>,
    );
    expect(getByTestId('locked').props.children).toBe('true');
    await act(() => {
      rerender(
        <AppLockProvider enabled={false}>
          <Probe />
        </AppLockProvider>,
      );
    });
    expect(getByTestId('locked').props.children).toBe('false');
  });
});
