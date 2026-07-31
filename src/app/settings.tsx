import DateTimePicker from '@react-native-community/datetimepicker';
import Constants from 'expo-constants';
import { Stack, router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { BudgetSheet, type BudgetSheetHandle } from '@/components/sl/budget-sheet';
import { DateRangeSheet, type DateRangeSheetHandle } from '@/components/sl/date-range-sheet';
import { PinSetupSheet, type PinSetupSheetHandle } from '@/components/sl/pin-setup-sheet';
import { RateOverrideSheet, type RateOverrideSheetHandle } from '@/components/sl/rate-override-sheet';
import { Segmented } from '@/components/sl/segmented';
import { Text } from '@/components/sl/text';
import { VerifyPinSheet, type VerifyPinSheetHandle } from '@/components/sl/verify-pin-sheet';
import { AccentGradient, Money, useColors } from '@/constants/tokens';
import { authenticateBiometric, clearPin, isBiometricAvailable } from '@/lib/app-lock';
import { CURRENCIES, type CurrencyCode } from '@/lib/currency';
import { exportAndShareCsv } from '@/lib/export';
import { formatMoney, toDateKey } from '@/lib/format';
import { convert } from '@/lib/fx';
import { useT } from '@/lib/i18n';
import { cancelDailyReminder, requestPermission, scheduleDailyReminder } from '@/lib/notifications';
import { db } from '@/lib/db';
import { useSettings } from '@/lib/settings-context';
import { resetTransactions } from '@/lib/transactions';
import { resetUserCategories } from '@/lib/user-categories';
import { toCategoryObj } from '@/lib/user-categories';
import { useTransactions } from '@/lib/transactions-context';
import { useSubscriptions } from '@/lib/subscriptions-context';

const THEME_MODES = ['auto', 'light', 'dark'] as const;
const LANGUAGE_MODES = ['auto', 'vi', 'en'] as const;

export default function SettingsScreen() {
  const colors = useColors();
  const { t } = useT();
  const {
    settings, update, reset,
    rates, fxLastFetchedAt, getRateSource,
    changePrimary, setManualRate, clearManualRate, refetchRates,
  } = useSettings();
  const { transactions, refresh, userCategories, refreshUserCategories } = useTransactions();
  const subscriptionsContext = useSubscriptions();
  const categoryExtras = userCategories.map(toCategoryObj);
  const exportSheetRef = useRef<DateRangeSheetHandle>(null);
  const budgetSheetRef = useRef<BudgetSheetHandle>(null);
  const pinSetupSheetRef = useRef<PinSetupSheetHandle>(null);
  const verifyPinSheetRef = useRef<VerifyPinSheetHandle>(null);
  const rateOverrideRef = useRef<RateOverrideSheetHandle>(null);
  const [verifyMode, setVerifyMode] = useState<'disable' | 'change'>('disable');
  const [timePicker, setTimePicker] = useState<null | 'first' | 'change'>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const nonUsdCurrencies = CURRENCIES.filter((c) => c !== 'USD' && c !== settings.primaryCurrency) as Exclude<CurrencyCode, 'USD'>[];

  const askChangePrimary = (target: CurrencyCode) => {
    if (target === settings.primaryCurrency) return;
    const rows = db.getAllSync<{ original_currency: string; n: number }>(
      "SELECT original_currency, COUNT(*) AS n FROM transactions GROUP BY original_currency"
    );
    const lines: string[] = [];
    let total = 0;
    for (const r of rows) {
      total += r.n;
      if (r.original_currency === target) {
        lines.push(t('currency.change_primary_unchanged', { n: r.n, code: target }));
      } else {
        lines.push(t('currency.change_primary_line', { n: r.n, from: r.original_currency, to: target }));
      }
    }
    const before = formatMoney(settings.monthlyBudget, settings.primaryCurrency);
    const after = formatMoney(
      convert(settings.monthlyBudget, settings.primaryCurrency, target, rates),
      target,
    );
    const anyFallback = nonUsdCurrencies.some((c) => getRateSource(c) === 'fallback');
    const body = [
      t('currency.change_primary_body', { n: total }),
      ...lines,
      '',
      t('currency.change_primary_budget', { before, after }),
      ...(anyFallback ? ['', t('currency.change_primary_fallback_warn')] : []),
    ].join('\n');
    Alert.alert(
      t('currency.change_primary_title', { code: target }),
      body,
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('currency.change_primary_confirm'),
          onPress: () => { changePrimary(target).catch(() => {}); },
        },
      ],
    );
  };

  const doRefetch = async () => {
    setFetchError(null);
    try {
      await refetchRates();
    } catch {
      setFetchError(t('currency.fetch_error'));
      setTimeout(() => setFetchError(null), 3000);
    }
  };

  const themeLabels = [t('settings.theme_auto'), t('settings.theme_light'), t('settings.theme_dark')];

  const onToggleReminder = async (v: boolean) => {
    if (!v) {
      update('reminderEnabled', false);
      await cancelDailyReminder();
      return;
    }
    const granted = await requestPermission();
    if (!granted) {
      Alert.alert(t('settings.permission_needed_title'), t('settings.permission_needed_body'));
      return;
    }
    setTimePicker('first');
  };

  const onTimePicked = async (_: unknown, d?: Date) => {
    const mode = timePicker;
    setTimePicker(null);
    if (!d || !mode) return;
    const hh = d.getHours();
    const mm = d.getMinutes();
    const hhmm = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    update('reminderHHMM', hhmm);
    if (mode === 'first') update('reminderEnabled', true);
    await scheduleDailyReminder(hh, mm);
  };

  const themeIndex = THEME_MODES.indexOf(settings.themeMode);
  const languageIndex = LANGUAGE_MODES.indexOf(settings.language ?? 'auto');

  const [hh, mm] = (settings.reminderHHMM ?? '21:00').split(':').map(Number);
  const initialTime = new Date();
  initialTime.setHours(hh, mm, 0, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack.Screen options={{ title: t('settings.title'), headerShown: true }} />
      <ScrollView contentContainerStyle={styles.body}>

        {/* NGÂN SÁCH */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>
          {t('settings.section_budget')}
        </Text>
        <Pressable style={[styles.row, { borderColor: colors.hairline }]} onPress={() => budgetSheetRef.current?.present(settings.monthlyBudget)}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.budget_row')}</Text>
          <Text style={{ color: colors.text, fontWeight: '600' }}>
            {settings.monthlyBudget > 0 ? formatMoney(settings.monthlyBudget, settings.primaryCurrency) : t('settings.budget_not_set')}
          </Text>
        </Pressable>

        {/* NHẮC NHỞ */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>
          {t('settings.section_reminder')}
        </Text>
        <View style={[styles.row, { borderColor: colors.hairline }]}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.reminder_row')}</Text>
          <Switch value={settings.reminderEnabled} onValueChange={onToggleReminder} />
        </View>
        {settings.reminderEnabled && (
          <Pressable
            style={[styles.row, { borderColor: colors.hairline }]}
            onPress={() => setTimePicker('change')}>
            <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.reminder_time')}</Text>
            <Text style={{ color: colors.text, fontWeight: '600' }}>
              {settings.reminderHHMM ?? t('settings.reminder_not_set')}
            </Text>
          </Pressable>
        )}
        <View style={[styles.row, { borderColor: colors.hairline, opacity: settings.monthlyBudget > 0 ? 1 : 0.5 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.budget_alerts_row')}</Text>
            {settings.monthlyBudget === 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{t('settings.budget_alerts_hint')}</Text>
            ) : null}
          </View>
          <Switch
            value={settings.budgetAlertsEnabled}
            disabled={settings.monthlyBudget === 0}
            onValueChange={(v) => update('budgetAlertsEnabled', v)}
          />
        </View>

        {/* NGÔN NGỮ */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>
          {t('settings.section_language')}
        </Text>
        <Segmented
          options={[t('settings.language_auto'), t('settings.language_vi'), t('settings.language_en')]}
          value={languageIndex >= 0 ? languageIndex : 0}
          onChange={(i) => update('language', LANGUAGE_MODES[i])}
        />

        {/* BẢO MẬT */}
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

        {/* GIAO DIỆN */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>{t('settings.section_theme')}</Text>
        <Segmented
          options={themeLabels}
          value={themeIndex >= 0 ? themeIndex : 0}
          onChange={(i) => update('themeMode', THEME_MODES[i])}
        />

        {/* ĐĂNG KÝ HÀNG THÁNG */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>
          {t('sub.section_title')}
        </Text>
        <Pressable
          style={[styles.row, { borderColor: colors.hairline }]}
          onPress={() => router.push('/subscriptions')}
        >
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('sub.section_row')}</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>
            {t('sub.count_active', { n: subscriptionsContext.count({ activeOnly: true }) })} ›
          </Text>
        </Pressable>

        {/* TIỀN TỆ */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>
          {t('currency.section_title')}
        </Text>
        <View style={{ marginHorizontal: 16, marginTop: 8 }}>
          <Text style={{ color: colors.text, fontWeight: '500', marginBottom: 6 }}>
            {t('currency.primary_label')}
          </Text>
          <Segmented
            options={[...CURRENCIES]}
            value={Math.max(0, CURRENCIES.indexOf(settings.primaryCurrency))}
            onChange={(i) => askChangePrimary(CURRENCIES[i])}
          />
        </View>
        <View style={[styles.row, { borderColor: colors.hairline, marginTop: 12, flexDirection: 'column', alignItems: 'stretch', gap: 8 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{t('currency.rates_label')}</Text>
            <Pressable onPress={doRefetch} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: AccentGradient[1], fontWeight: '600' }}>{t('currency.fetch_now')}</Text>
            </Pressable>
          </View>
          {fxLastFetchedAt ? (
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              {t('currency.last_fetched', { time: new Date(fxLastFetchedAt).toLocaleTimeString() })}
            </Text>
          ) : null}
          {fetchError ? <Text style={{ color: Money.expense, fontSize: 12 }}>{fetchError}</Text> : null}
          {nonUsdCurrencies.map((cc) => {
            const rateUsd = rates[cc];
            const source = getRateSource(cc);
            const displayRate = formatMoney(
              convert(1, cc, settings.primaryCurrency, rates),
              settings.primaryCurrency,
            );
            return (
              <Pressable
                key={cc}
                onPress={() => rateOverrideRef.current?.present(cc, rateUsd)}
                style={({ pressed }) => ({
                  paddingVertical: 10, opacity: pressed ? 0.6 : 1,
                  flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                })}
              >
                <Text style={{ color: colors.text }}>
                  {t('currency.rate_row', { from: cc, value: displayRate, to: '' }).replace(/\s*$/, '')}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                    {t(`currency.source_${source ?? 'fallback'}`)}
                  </Text>
                  {source === 'manual' ? (
                    <Pressable onPress={() => clearManualRate(cc)}>
                      <Text style={{ color: AccentGradient[1], fontSize: 12 }}>{t('currency.revert_to_auto')}</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* DỮ LIỆU */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>{t('settings.section_data')}</Text>
        <Pressable style={[styles.row, { borderColor: colors.hairline }]} onPress={() => exportSheetRef.current?.present()}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.export_row')}</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>›</Text>
        </Pressable>
        <Pressable
          style={[styles.row, { borderColor: colors.hairline }]}
          onPress={() =>
            Alert.alert(t('settings.reset_txns_title'), t('settings.reset_txns_body'), [
              { text: t('settings.cancel'), style: 'cancel' },
              {
                text: t('settings.delete'),
                style: 'destructive',
                onPress: () => {
                  resetTransactions();
                  refresh();
                },
              },
            ])
          }>
          <Text style={{ color: '#FB5B4D', fontWeight: '500' }}>{t('settings.reset_txns_row')}</Text>
        </Pressable>
        <Pressable
          style={[styles.row, { borderColor: colors.hairline }]}
          onPress={() =>
            Alert.alert(t('settings.reset_all_title'), t('settings.reset_all_body'), [
              { text: t('settings.cancel'), style: 'cancel' },
              {
                text: t('settings.reset'),
                style: 'destructive',
                onPress: async () => {
                  resetTransactions();
                  resetUserCategories();
                  reset();
                  await cancelDailyReminder();
                  try {
                    await clearPin();
                  } catch (err) {
                    console.warn('Failed to clear PIN', err);
                  }
                  refresh();
                  refreshUserCategories();
                },
              },
            ])
          }>
          <Text style={{ color: '#FB5B4D', fontWeight: '500' }}>{t('settings.reset_all_row')}</Text>
        </Pressable>

        {/* THÔNG TIN */}
        <Text style={[styles.sectionHeader, { color: colors.textSecondary, fontWeight: '700' }]}>{t('settings.section_info')}</Text>
        <View style={[styles.row, { borderColor: colors.hairline }]}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.version_row')}</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>
            {Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </View>
        <Pressable
          style={[styles.row, { borderColor: colors.hairline }]}
          onPress={() => Linking.openURL('https://github.com/bluez44/SpendLens')}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.github_row')}</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>›</Text>
        </Pressable>
        <Pressable
          style={[styles.row, { borderColor: colors.hairline }]}
          onPress={() => Linking.openURL('https://github.com/bluez44/SpendLens/issues')}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.bug_row')}</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>›</Text>
        </Pressable>
        <View style={[styles.row, { borderColor: colors.hairline }]}>
          <Text style={{ color: colors.text, fontWeight: '500' }}>{t('settings.license_row')}</Text>
          <Text style={{ color: colors.textSecondary, fontWeight: '500' }}>MIT</Text>
        </View>
      </ScrollView>

      {timePicker != null && (
        <DateTimePicker value={initialTime} mode="time" is24Hour onChange={onTimePicked} />
      )}

      <DateRangeSheet
        ref={exportSheetRef}
        initialFrom={toDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
        initialTo={toDateKey(new Date())}
        onExport={async (from, to) => {
          const filtered = transactions.filter((tx) => tx.date >= from && tx.date <= to);
          await exportAndShareCsv(filtered, categoryExtras);
        }}
      />

      <BudgetSheet
        ref={budgetSheetRef}
        onSave={(n) => update('monthlyBudget', n)}
      />

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

      <RateOverrideSheet
        ref={rateOverrideRef}
        onSave={(cc, rate) => { setManualRate(cc, rate); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 8 },
  sectionHeader: { marginTop: 16, fontSize: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
  },
});
