import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PinPad } from '@/components/sl/pin-pad';
import { Text } from '@/components/sl/text';
import { Money, useColors, W } from '@/constants/tokens';
import {
  authenticateBiometric,
  hasPinSet,
  INITIAL_LOCKOUT_STATE,
  isBiometricAvailable,
  isLockedOut,
  recordFailedAttempt,
  recordSuccess,
  verifyPin,
  type LockoutState,
} from '@/lib/app-lock';
import { useT } from '@/lib/i18n';

const PIN_LENGTH = 6;

export interface LockScreenProps {
  biometricEnabled: boolean;
  onUnlock: () => void;
}

export function LockScreen({ biometricEnabled, onUnlock }: LockScreenProps) {
  const c = useColors();
  const { t } = useT();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState(false);
  const [lockout, setLockout] = useState<LockoutState>(INITIAL_LOCKOUT_STATE);
  const [remainingLockMs, setRemainingLockMs] = useState(0);
  const biometricTried = useRef(false);

  useEffect(() => {
    hasPinSet().then((has) => {
      if (!has) onUnlock();
    });
  }, [onUnlock]);

  const runBiometric = useCallback(() => {
    isBiometricAvailable().then((available) => {
      if (!available) return;
      authenticateBiometric(t('lock.title')).then((success) => {
        if (success) onUnlock();
      });
    });
  }, [onUnlock, t]);

  useEffect(() => {
    if (!biometricEnabled || biometricTried.current) return;
    biometricTried.current = true;
    runBiometric();
  }, [biometricEnabled, runBiometric]);

  useEffect(() => {
    if (!isLockedOut(lockout, Date.now())) {
      setRemainingLockMs(0);
      return;
    }
    const id = setInterval(() => {
      const remaining = (lockout.lockedUntil ?? 0) - Date.now();
      if (remaining <= 0) {
        setRemainingLockMs(0);
        clearInterval(id);
        return;
      }
      setRemainingLockMs(remaining);
    }, 500);
    return () => clearInterval(id);
  }, [lockout]);

  const locked = isLockedOut(lockout, Date.now());

  const submit = async (pin: string) => {
    const ok = await verifyPin(pin);
    if (ok) {
      setLockout(recordSuccess());
      onUnlock();
      return;
    }
    setError(true);
    setDraft('');
    setLockout((prev) => recordFailedAttempt(prev, Date.now()));
  };

  const onDigit = (d: string) => {
    if (locked) return;
    setError(false);
    const next = draft + d;
    setDraft(next);
    if (next.length === PIN_LENGTH) submit(next);
  };

  const onDelete = () => {
    if (locked) return;
    setDraft((prev) => prev.slice(0, -1));
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.container, { backgroundColor: c.bg }]}>
      <Text style={{ color: c.text, fontSize: 18, fontWeight: W.bold, marginBottom: 24 }}>
        {t('lock.title')}
      </Text>
      <PinPad
        value={draft}
        length={PIN_LENGTH}
        onDigit={onDigit}
        onDelete={onDelete}
        onBiometricPress={biometricEnabled ? runBiometric : undefined}
        disabled={locked}
        error={error}
      />
      <View style={styles.message}>
        {locked ? (
          <Text style={{ color: Money.expense, fontWeight: W.semibold }}>
            {t('lock.locked_message', { seconds: Math.ceil(remainingLockMs / 1000) })}
          </Text>
        ) : error ? (
          <Text style={{ color: Money.expense, fontWeight: W.semibold }}>
            {t('lock.wrong_pin', { count: Math.max(0, 5 - lockout.failedAttempts) })}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: { marginTop: 20, height: 20 },
});
