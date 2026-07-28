const mockStore: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  __esModule: true,
  getItemAsync: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
}));
jest.mock('expo-crypto', () => ({
  __esModule: true,
  randomUUID: jest.fn(() => 'generated-uuid'),
}));

import { getOrCreateDeviceId } from './device-id';

describe('getOrCreateDeviceId', () => {
  beforeEach(() => { for (const k of Object.keys(mockStore)) delete mockStore[k]; });

  it('generates a UUID on first call and persists it', async () => {
    const id = await getOrCreateDeviceId();
    expect(id).toBe('generated-uuid');
    expect(mockStore['spendlens.device_id']).toBe('generated-uuid');
  });

  it('returns the persisted UUID on subsequent calls', async () => {
    mockStore['spendlens.device_id'] = 'existing-uuid';
    const id = await getOrCreateDeviceId();
    expect(id).toBe('existing-uuid');
  });
});
