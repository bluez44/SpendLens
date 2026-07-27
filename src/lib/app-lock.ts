import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const PIN_HASH_KEY = 'spendlens_pin_hash';
const PIN_SALT_KEY = 'spendlens_pin_salt';

async function hash(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pin + salt);
}

export async function setPin(pin: string): Promise<void> {
  const salt = Crypto.randomUUID();
  const hashed = await hash(pin, salt);
  await SecureStore.setItemAsync(PIN_SALT_KEY, salt);
  await SecureStore.setItemAsync(PIN_HASH_KEY, hashed);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const salt = await SecureStore.getItemAsync(PIN_SALT_KEY);
  const storedHash = await SecureStore.getItemAsync(PIN_HASH_KEY);
  if (!salt || !storedHash) return false;
  return (await hash(pin, salt)) === storedHash;
}

export async function hasPinSet(): Promise<boolean> {
  return (await SecureStore.getItemAsync(PIN_HASH_KEY)) !== null;
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_HASH_KEY);
  await SecureStore.deleteItemAsync(PIN_SALT_KEY);
}

/* ------------------------------------------------------------------ */
/* Lockout — pure state machine, no I/O                                */
/* ------------------------------------------------------------------ */

export interface LockoutState {
  failedAttempts: number;
  lockedUntil: number | null;
}

export const INITIAL_LOCKOUT_STATE: LockoutState = { failedAttempts: 0, lockedUntil: null };

const LOCKOUT_THRESHOLD = 5;
const BASE_LOCKOUT_MS = 30_000;
/** Not specified by the spec — capped so a long string of typos (e.g. a
 * child playing with the phone) can't lock the owner out for hours. */
const MAX_LOCKOUT_MS = 300_000;

export function isLockedOut(state: LockoutState, now: number): boolean {
  return state.lockedUntil !== null && now < state.lockedUntil;
}

export function recordFailedAttempt(state: LockoutState, now: number): LockoutState {
  const failedAttempts = state.failedAttempts + 1;
  if (failedAttempts < LOCKOUT_THRESHOLD) {
    return { failedAttempts, lockedUntil: null };
  }
  const doublings = failedAttempts - LOCKOUT_THRESHOLD;
  const durationMs = Math.min(BASE_LOCKOUT_MS * 2 ** doublings, MAX_LOCKOUT_MS);
  return { failedAttempts, lockedUntil: now + durationMs };
}

export function recordSuccess(): LockoutState {
  return INITIAL_LOCKOUT_STATE;
}
