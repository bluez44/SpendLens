jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { deviceName: 'Test Device' },
}));

import { createSession, isKicked } from './session';

describe('createSession', () => {
  it('produces SessionInfo with deviceId + deviceName + loggedInAt', () => {
    const before = Date.now();
    const s = createSession('device-1');
    expect(s.deviceId).toBe('device-1');
    expect(s.deviceName).toBe('Test Device');
    expect(s.loggedInAt).toBeGreaterThanOrEqual(before);
  });
});

describe('isKicked', () => {
  it('returns false when remote is null (never signed in yet)', () => {
    expect(isKicked(null, 'device-1')).toBe(false);
  });
  it('returns false when deviceIds match', () => {
    expect(isKicked({ deviceId: 'device-1', deviceName: 'x', loggedInAt: 0 }, 'device-1')).toBe(false);
  });
  it('returns true when deviceIds differ', () => {
    expect(isKicked({ deviceId: 'other', deviceName: 'x', loggedInAt: 0 }, 'device-1')).toBe(true);
  });
});
