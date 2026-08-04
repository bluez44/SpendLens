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
import { DarkTheme, DefaultTheme, ThemeProvider, Stack, router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getColors } from '@/constants/tokens';
import { LockScreen } from '@/components/sl/lock-screen';
import { AppLockProvider, useAppLock } from '@/lib/app-lock-context';
import { SettingsProvider, useSettings } from '@/lib/settings-context';
import { ThemeProvider as SLThemeProvider } from '@/lib/theme-context';
import { TransactionsProvider } from '@/lib/transactions-context';
import { SubscriptionsProvider } from '@/lib/subscriptions-context';
import { scheduleDailyReminder } from '@/lib/notifications';

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
            <Stack.Screen name="history-months" />
            <Stack.Screen name="gallery" />
            <Stack.Screen name="entry" options={{ presentation: 'modal' }} />
            <Stack.Screen name="transaction/[id]" />
            <Stack.Screen name="subscriptions" />
            <Stack.Screen name="compare" />
          </Stack>
          {isLocked && <LockScreen biometricEnabled={settings.appLockBiometricEnabled} onUnlock={unlock} />}
        </BottomSheetModalProvider>
      </ThemeProvider>
    </SLThemeProvider>
  );
}

function LockGate({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  return <AppLockProvider enabled={settings.appLockEnabled}>{children}</AppLockProvider>;
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

  useEffect(() => {
    if (!fontsLoaded) return;
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const route = (response.notification.request.content.data as { route?: string })?.route;
      if (route === '/subscriptions') {
        router.push('/subscriptions');
      }
    });
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = (response.notification.request.content.data as { route?: string })?.route;
      if (route === '/subscriptions') {
        router.push('/subscriptions');
      }
    });
    return () => sub.remove();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SettingsProvider>
          <TransactionsProvider>
            <SubscriptionsProvider>
              <LockGate>
                <ThemedShell scheme={scheme} />
              </LockGate>
            </SubscriptionsProvider>
          </TransactionsProvider>
        </SettingsProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
