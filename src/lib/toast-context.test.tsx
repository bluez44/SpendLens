import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Text } from '@/components/sl/text';
import { ToastProvider, useToast, type ToastOptions } from './toast-context';

const METRICS = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
};

function Trigger({ id, opts }: { id: string; opts: ToastOptions }) {
  const { show } = useToast();
  return (
    <Pressable testID={id} onPress={() => show(opts)}>
      <Text>{id}</Text>
    </Pressable>
  );
}

function renderWithToast(ui: React.ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ToastProvider>{ui}</ToastProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('ToastProvider', () => {
  it('shows the message', async () => {
    const { getByTestId, getByText } = await renderWithToast(<Trigger id="a" opts={{ message: 'Saved' }} />);
    await act(async () => { fireEvent.press(getByTestId('a')); });
    expect(getByText('Saved')).toBeTruthy();
  });

  it('hides, then calls onAction when the action is pressed', async () => {
    const calls: string[] = [];
    const utils = await renderWithToast(
      <Trigger id="a" opts={{
        message: 'Saved', actionLabel: 'Undo',
        onAction: () => { calls.push('undo'); },
      }} />,
    );
    await act(async () => { fireEvent.press(utils.getByTestId('a')); });
    await act(async () => { fireEvent.press(utils.getByRole('button', { name: 'Undo' })); });
    expect(calls).toEqual(['undo']);
    expect(utils.queryByText('Saved')).toBeNull();
  });

  it('lets onAction show a follow-up toast', async () => {
    function UndoFlow() {
      const { show } = useToast();
      return (
        <Pressable testID="go" onPress={() => show({
          message: 'Saved', actionLabel: 'Undo',
          onAction: () => show({ message: 'Undone', durationMs: 2000 }),
        })}>
          <Text>go</Text>
        </Pressable>
      );
    }
    const { getByTestId, getByRole, getByText, queryByText } = await renderWithToast(<UndoFlow />);
    await act(async () => { fireEvent.press(getByTestId('go')); });
    await act(async () => { fireEvent.press(getByRole('button', { name: 'Undo' })); });
    expect(queryByText('Saved')).toBeNull();
    expect(getByText('Undone')).toBeTruthy();
  });

  it('auto-hides after durationMs', async () => {
    const { getByTestId, queryByText } = await renderWithToast(<Trigger id="a" opts={{ message: 'Bye', durationMs: 1000 }} />);
    await act(async () => { fireEvent.press(getByTestId('a')); });
    await act(async () => { jest.advanceTimersByTime(999); });
    expect(queryByText('Bye')).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(queryByText('Bye')).toBeNull();
  });

  it('defaults to 5 seconds', async () => {
    const { getByTestId, queryByText } = await renderWithToast(<Trigger id="a" opts={{ message: 'Bye' }} />);
    await act(async () => { fireEvent.press(getByTestId('a')); });
    await act(async () => { jest.advanceTimersByTime(4999); });
    expect(queryByText('Bye')).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(queryByText('Bye')).toBeNull();
  });

  it('replaces the current toast and restarts the timer', async () => {
    const { getByTestId, queryByText } = await renderWithToast(
      <>
        <Trigger id="a" opts={{ message: 'First', durationMs: 1000 }} />
        <Trigger id="b" opts={{ message: 'Second', durationMs: 1000 }} />
      </>,
    );
    await act(async () => { fireEvent.press(getByTestId('a')); });
    await act(async () => { jest.advanceTimersByTime(800); });
    await act(async () => { fireEvent.press(getByTestId('b')); });
    expect(queryByText('First')).toBeNull();
    await act(async () => { jest.advanceTimersByTime(800); });
    expect(queryByText('Second')).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(200); });
    expect(queryByText('Second')).toBeNull();
  });
});
