import '@/lib/i18n';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getColors } from '@/constants/tokens';
import { LockScreen } from '@/components/sl/lock-screen';
import {
  ChooseDataSourceSheet,
  type ChooseDataSourceSheetHandle,
} from '@/components/sl/choose-data-source-sheet';
import {
  PreviewChangesSheet,
  type PreviewChangesSheetHandle,
} from '@/components/sl/preview-changes-sheet';
import { KickedDeviceSheet } from '@/components/sl/kicked-device-sheet';
import { AppLockProvider, useAppLock } from '@/lib/app-lock-context';
import { SettingsProvider, useSettings } from '@/lib/settings-context';
import { SyncProvider, useSync } from '@/lib/sync/sync-context';
import { ThemeProvider as SLThemeProvider } from '@/lib/theme-context';
import { TransactionsProvider } from '@/lib/transactions-context';
import { scheduleDailyReminder } from '@/lib/notifications';
import type { MergeStrategy } from '@/lib/sync/types';

SplashScreen.preventAutoHideAsync().catch(() => {});

function ThemedShell({ scheme }: { scheme: string | null | undefined }) {
  const { settings } = useSettings();
  const { isLocked, unlock } = useAppLock();
  const rawEffective = settings.themeMode === 'auto' ? scheme : settings.themeMode;
  const effective: 'light' | 'dark' = rawEffective === 'dark' ? 'dark' : 'light';
  const colors = getColors(effective);

  useEffect(() => {
    if (!settings.reminderEnabled || !settings.reminderHHMM) return;
    const [hh, mm] = settings.reminderHHMM.split(':').map(Number);
    scheduleDailyReminder(hh, mm).catch(() => {
      // silent — permission may have been revoked externally
    });
  }, [settings.reminderEnabled, settings.reminderHHMM]);

  return (
    <SLThemeProvider value={effective}>
      <ThemeProvider value={effective === 'dark' ? DarkTheme : DefaultTheme}>
        <StatusBar style={effective === 'dark' ? 'light' : 'dark'} />
        <BottomSheetModalProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
            }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="home" />
            <Stack.Screen name="history" />
            <Stack.Screen name="gallery" />
            <Stack.Screen name="entry" options={{ presentation: 'modal' }} />
            <Stack.Screen name="transaction/[id]" />
          </Stack>
          {isLocked && <LockScreen biometricEnabled={settings.appLockBiometricEnabled} onUnlock={unlock} />}
          <GlobalSyncSheets />
        </BottomSheetModalProvider>
      </ThemeProvider>
    </SLThemeProvider>
  );
}

function LockGate({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  return <AppLockProvider enabled={settings.appLockEnabled}>{children}</AppLockProvider>;
}

function GlobalSyncSheets() {
  const {
    pendingFirstLogin, pendingKicked,
    applyFirstLoginChoice, handleKickedChoice,
  } = useSync();
  const chooseRef = useRef<ChooseDataSourceSheetHandle>(null);
  const previewRef = useRef<PreviewChangesSheetHandle>(null);
  const [pickedStrategy, setPickedStrategy] = useState<MergeStrategy | null>(null);

  useEffect(() => {
    if (pendingFirstLogin) {
      chooseRef.current?.present(pendingFirstLogin.local, pendingFirstLogin.remote);
    }
  }, [pendingFirstLogin]);

  return (
    <>
      <ChooseDataSourceSheet
        ref={chooseRef}
        onChoice={(s) => {
          setPickedStrategy(s);
          if (pendingFirstLogin) {
            previewRef.current?.present(pendingFirstLogin.local, pendingFirstLogin.remote, s);
          }
        }}
      />
      <PreviewChangesSheet
        ref={previewRef}
        onBack={() => {
          if (pendingFirstLogin) {
            chooseRef.current?.present(pendingFirstLogin.local, pendingFirstLogin.remote);
          }
        }}
        onConfirm={() => {
          if (pickedStrategy) applyFirstLoginChoice(pickedStrategy).catch(() => {});
        }}
      />
      <KickedDeviceSheet
        visible={pendingKicked}
        onChoice={(c) => { handleKickedChoice(c).catch(() => {}); }}
      />
    </>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();

  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <SyncProvider>
            <TransactionsProvider>
              <LockGate>
                <ThemedShell scheme={scheme} />
              </LockGate>
            </TransactionsProvider>
          </SyncProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
