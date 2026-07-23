import { render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ThemeProvider, useEffectiveScheme } from './theme-context';

function ProbeScheme() {
  const s = useEffectiveScheme();
  return <Text testID="probe">{s}</Text>;
}

describe('theme-context', () => {
  it('returns "light" outside a provider (default)', async () => {
    const { getByTestId } = await render(<ProbeScheme />);
    expect(getByTestId('probe').props.children).toBe('light');
  });

  it('returns the provider value when wrapped', async () => {
    const { getByTestId } = await render(
      <ThemeProvider value="dark">
        <ProbeScheme />
      </ThemeProvider>,
    );
    expect(getByTestId('probe').props.children).toBe('dark');
  });
});
