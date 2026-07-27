import { act, render } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';

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

async function emitAppState(state: 'active' | 'background' | 'inactive') {
  const spy = AppState.addEventListener as jest.Mock;
  const handler = spy.mock.calls[spy.mock.calls.length - 1][1];
  await act(() => handler(state));
}

beforeEach(() => {
  jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never);
});

afterEach(() => {
  (AppState.addEventListener as jest.Mock).mockRestore();
});

describe('AppLockProvider — disabled', () => {
  it('never locks, regardless of AppState transitions', async () => {
    const { getByTestId } = await render(
      <AppLockProvider enabled={false}>
        <Probe />
      </AppLockProvider>,
    );
    expect(getByTestId('locked').props.children).toBe('false');
    await emitAppState('background');
    await emitAppState('active');
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

  it('unlock() clears the lock', async () => {
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

  it('re-locks when the app goes to background and returns to active', async () => {
    const { getByTestId } = await render(
      <AppLockProvider enabled>
        <Probe />
      </AppLockProvider>,
    );
    await act(() => {
      getByTestId('unlock').props.onPress();
    });
    expect(getByTestId('locked').props.children).toBe('false');
    await emitAppState('background');
    expect(getByTestId('locked').props.children).toBe('true');
  });

  it('does not lock on a transient "inactive" transition', async () => {
    const { getByTestId } = await render(
      <AppLockProvider enabled>
        <Probe />
      </AppLockProvider>,
    );
    await act(() => {
      getByTestId('unlock').props.onPress();
    });
    expect(getByTestId('locked').props.children).toBe('false');
    await emitAppState('inactive');
    expect(getByTestId('locked').props.children).toBe('false');
  });
});
