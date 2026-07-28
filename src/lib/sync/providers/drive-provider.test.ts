jest.mock('expo-file-system', () => ({
  __esModule: true,
  Paths: { document: { uri: 'file:///doc/' } },
  File: jest.fn(),
  Directory: jest.fn(),
}));
jest.mock('@react-native-google-signin/google-signin', () => ({
  __esModule: true,
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(),
    signOut: jest.fn(),
    getCurrentUser: jest.fn(),
    getTokens: jest.fn(async () => ({ accessToken: 'tok' })),
  },
}));

import { configureCloudSyncProvider, getCloudSyncProvider } from './index';
import { MockCloudSyncProvider } from './mock-provider';

describe('provider factory', () => {
  it('returns a provider configured via configureCloudSyncProvider', () => {
    const mock = new MockCloudSyncProvider();
    configureCloudSyncProvider(mock);
    expect(getCloudSyncProvider()).toBe(mock);
  });
});
