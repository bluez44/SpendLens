import { useRef, useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';

import { PinSetupSheet, type PinSetupSheetHandle } from '@/components/sl/pin-setup-sheet';
import { Text } from '@/components/sl/text';
import { VerifyPinSheet, type VerifyPinSheetHandle } from '@/components/sl/verify-pin-sheet';
import { useColors } from '@/constants/tokens';
import { authenticateBiometric, clearPin, isBiometricAvailable } from '@/lib/app-lock';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-context';

import { settingsStyles as styles } from './styles';

export function AppLockSection() {
  const colors = useColors();
  const { t } = useT();
  const { settings, update } = useSettings();
  const pinSetupSheetRef = useRef<PinSetupSheetHandle>(null);
  const verifyPinSheetRef = useRef<VerifyPinSheetHandle>(null);
  const [verifyMode, setVerifyMode] = useState<'disable' | 'change'>('disable');

  return (
    <>
      <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>
        {t('settings.section_security')}
      </Text>
      <View style={[styles.row, { borderColor: colors.hairline }]}>
        <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.applock_row')}</Text>
        <Switch
          value={settings.appLockEnabled}
          onValueChange={(v) => {
            if (v) {
              pinSetupSheetRef.current?.present();
              return;
            }
            setVerifyMode('disable');
            verifyPinSheetRef.current?.present();
          }}
        />
      </View>
      {settings.appLockEnabled && (
        <>
          <Pressable
            style={[styles.row, { borderColor: colors.hairline }]}
            onPress={() => {
              setVerifyMode('change');
              verifyPinSheetRef.current?.present();
            }}>
            <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.applock_change_pin')}</Text>
            <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>›</Text>
          </Pressable>
          <View style={[styles.row, { borderColor: colors.hairline }]}>
            <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.applock_biometric_row')}</Text>
            <Switch
              value={settings.appLockBiometricEnabled}
              onValueChange={async (v) => {
                if (!v) {
                  update('appLockBiometricEnabled', false);
                  return;
                }
                const available = await isBiometricAvailable();
                if (!available) {
                  Alert.alert(
                    t('settings.applock_biometric_unavailable_title'),
                    t('settings.applock_biometric_unavailable_body'),
                  );
                  return;
                }
                const ok = await authenticateBiometric(t('settings.applock_biometric_verify_title'));
                if (!ok) {
                  Alert.alert(
                    t('settings.applock_biometric_verify_failed_title'),
                    t('settings.applock_biometric_verify_failed_body'),
                  );
                  return;
                }
                update('appLockBiometricEnabled', true);
              }}
            />
          </View>
        </>
      )}

      <PinSetupSheet
        ref={pinSetupSheetRef}
        onComplete={() => {
          update('appLockEnabled', true);
        }}
      />

      <VerifyPinSheet
        ref={verifyPinSheetRef}
        title={
          verifyMode === 'disable'
            ? t('settings.applock_verify_disable_title')
            : t('settings.applock_verify_change_title')
        }
        biometricEnabled={settings.appLockBiometricEnabled}
        onVerified={async () => {
          if (verifyMode === 'disable') {
            try {
              await clearPin();
            } catch (err) {
              console.warn('Failed to clear PIN', err);
            }
            update('appLockEnabled', false);
            update('appLockBiometricEnabled', false);
            return;
          }
          pinSetupSheetRef.current?.present();
        }}
      />
    </>
  );
}
