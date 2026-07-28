const mockState: { type: string; isConnected: boolean } = { type: 'WIFI', isConnected: true };
jest.mock('expo-network', () => ({
  __esModule: true,
  getNetworkStateAsync: jest.fn(async () => mockState),
  NetworkStateType: { WIFI: 'WIFI', CELLULAR: 'CELLULAR', NONE: 'NONE' },
}));

import { shouldSyncPhotos } from './network-policy';

describe('shouldSyncPhotos', () => {
  beforeEach(() => { mockState.type = 'WIFI'; mockState.isConnected = true; });

  it('off never syncs', async () => {
    expect(await shouldSyncPhotos('off')).toBe(false);
  });
  it('always syncs when connected', async () => {
    mockState.type = 'CELLULAR';
    expect(await shouldSyncPhotos('always')).toBe(true);
  });
  it('always does not sync when offline', async () => {
    mockState.isConnected = false;
    expect(await shouldSyncPhotos('always')).toBe(false);
  });
  it('wifi syncs on WIFI', async () => {
    expect(await shouldSyncPhotos('wifi')).toBe(true);
  });
  it('wifi does not sync on CELLULAR', async () => {
    mockState.type = 'CELLULAR';
    expect(await shouldSyncPhotos('wifi')).toBe(false);
  });
});
