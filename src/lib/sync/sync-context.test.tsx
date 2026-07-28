jest.mock('expo-file-system', () => ({
  __esModule: true,
  Paths: { document: { uri: 'file:///doc/' } },
  File: jest.fn().mockImplementation(() => ({ exists: false })),
  Directory: jest.fn().mockImplementation(() => ({ exists: false, create() {}, delete() {} })),
}));
jest.mock('@react-native-google-signin/google-signin', () => ({
  __esModule: true,
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(),
    signOut: jest.fn(),
    getCurrentUser: jest.fn(() => null),
    getTokens: jest.fn(async () => ({ accessToken: 'tok' })),
  },
}));
jest.mock('./network-policy', () => ({
  __esModule: true,
  shouldSyncPhotos: jest.fn(async () => false),
}));
jest.mock('./device-id', () => ({
  __esModule: true,
  getOrCreateDeviceId: jest.fn(async () => 'device-1'),
}));
jest.mock('expo-localization', () => ({
  __esModule: true,
  getLocales: () => [{ languageCode: 'vi' }],
}));

import { render, waitFor } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { SettingsProvider } from '../settings-context';
import { SyncProvider, useMaybeSync } from './sync-context';
import { configureCloudSyncProvider } from './providers';
import { MockCloudSyncProvider } from './providers/mock-provider';

function Probe() {
  const ctx = useMaybeSync();
  if (!ctx) return <Text testID="probe">loading</Text>;
  return (
    <View>
      <Text testID="state">{ctx.state}</Text>
      <Text testID="user">{ctx.user?.email ?? 'anon'}</Text>
    </View>
  );
}

describe('SyncProvider', () => {
  it('starts in idle, no user', async () => {
    configureCloudSyncProvider(new MockCloudSyncProvider());
    const { getByTestId } = await render(
      <SettingsProvider>
        <SyncProvider>
          <Probe />
        </SyncProvider>
      </SettingsProvider>
    );
    await waitFor(() => {
      expect(getByTestId('state').props.children).toBe('idle');
      expect(getByTestId('user').props.children).toBe('anon');
    });
  });
});
