jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    setItemAsync: jest.fn((k: string, v: string) => {
      store.set(k, v);
      return Promise.resolve();
    }),
    getItemAsync: jest.fn((k: string) => Promise.resolve(store.get(k) ?? null)),
    deleteItemAsync: jest.fn((k: string) => {
      store.delete(k);
      return Promise.resolve();
    }),
  };
});

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  digestStringAsync: jest.fn((_algo: string, data: string) => Promise.resolve(`hash(${data})`)),
  randomUUID: jest.fn(() => 'fixed-salt'),
}));

import * as SecureStore from 'expo-secure-store';

import {
  clearPin,
  hasPinSet,
  INITIAL_LOCKOUT_STATE,
  isLockedOut,
  recordFailedAttempt,
  recordSuccess,
  setPin,
  verifyPin,
} from './app-lock';

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => store.clear());

describe('setPin / verifyPin', () => {
  it('verifies the correct PIN', async () => {
    await setPin('123456');
    expect(await verifyPin('123456')).toBe(true);
  });

  it('rejects an incorrect PIN', async () => {
    await setPin('123456');
    expect(await verifyPin('654321')).toBe(false);
  });

  it('never stores the raw PIN string in SecureStore', async () => {
    await setPin('123456');
    const values = [...store.values()];
    expect(values.some((v) => v === '123456')).toBe(false);
  });
});

describe('hasPinSet', () => {
  it('is false before a PIN is set', async () => {
    expect(await hasPinSet()).toBe(false);
  });

  it('is true after a PIN is set', async () => {
    await setPin('123456');
    expect(await hasPinSet()).toBe(true);
  });
});

describe('clearPin', () => {
  it('removes the PIN so verifyPin and hasPinSet reflect no PIN', async () => {
    await setPin('123456');
    await clearPin();
    expect(await hasPinSet()).toBe(false);
    expect(await verifyPin('123456')).toBe(false);
  });
});

describe('lockout state machine', () => {
  const now = 1_000_000;

  it('does not lock out attempts 1-4', () => {
    let state = INITIAL_LOCKOUT_STATE;
    for (let i = 0; i < 4; i++) {
      state = recordFailedAttempt(state, now);
      expect(isLockedOut(state, now)).toBe(false);
    }
    expect(state.failedAttempts).toBe(4);
  });

  it('locks out for 30s starting at the 5th failed attempt', () => {
    let state = INITIAL_LOCKOUT_STATE;
    for (let i = 0; i < 5; i++) state = recordFailedAttempt(state, now);
    expect(isLockedOut(state, now)).toBe(true);
    expect(state.lockedUntil).toBe(now + 30_000);
    expect(isLockedOut(state, now + 30_000)).toBe(false);
  });

  it('doubles the lockout duration on the 6th and 7th failed attempts', () => {
    let state = INITIAL_LOCKOUT_STATE;
    for (let i = 0; i < 6; i++) state = recordFailedAttempt(state, now);
    expect(state.lockedUntil).toBe(now + 60_000);
    state = recordFailedAttempt(state, now);
    expect(state.lockedUntil).toBe(now + 120_000);
  });

  it('caps the lockout duration at 5 minutes', () => {
    let state = INITIAL_LOCKOUT_STATE;
    for (let i = 0; i < 12; i++) state = recordFailedAttempt(state, now);
    expect(state.lockedUntil).toBe(now + 300_000);
  });

  it('recordSuccess resets attempts and lockout', () => {
    let state = INITIAL_LOCKOUT_STATE;
    for (let i = 0; i < 5; i++) state = recordFailedAttempt(state, now);
    state = recordSuccess();
    expect(state).toEqual(INITIAL_LOCKOUT_STATE);
  });
});
