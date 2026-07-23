import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { getColors } from '@/constants/tokens';
import { SettingsProvider, useSettings } from '@/lib/settings-context';
import { ThemeProvider as SLThemeProvider } from '@/lib/theme-context';
import { TransactionsProvider } from '@/lib/transactions-context';
import { scheduleDailyReminder } from '@/lib/notifications';

SplashScreen.preventAutoHideAsync().catch(() => {});

function ThemedShell({ scheme }: { scheme: string | null | undefined }) {
  const { settings } = useSettings();
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
      </ThemeProvider>
    </SLThemeProvider>
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
    <SafeAreaProvider>
      <SettingsProvider>
        <TransactionsProvider>
          <ThemedShell scheme={scheme} />
        </TransactionsProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
