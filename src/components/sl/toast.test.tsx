import { render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Toast } from './toast';

const METRICS = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, bottom: 0, left: 0, right: 0 },
};

function renderToast(ui: React.ReactElement) {
  return render(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);
}

describe('Toast', () => {
  it('sits above the camera capture row instead of overlapping it', async () => {
    const { getByTestId } = await renderToast(<Toast message="Saved" />);
    expect(getByTestId('toast-wrap').props.style).toMatchObject({ bottom: 140 });
  });

  it('announces the message for VoiceOver on mount', async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    await renderToast(<Toast message="Saved" />);
    expect(spy).toHaveBeenCalledWith('Saved');
    spy.mockRestore();
  });
});
