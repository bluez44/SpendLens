import { useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import { RateOverrideSheet, type RateOverrideSheetHandle } from '@/components/sl/rate-override-sheet';
import { Segmented } from '@/components/sl/segmented';
import { Text } from '@/components/sl/text';
import { AccentGradient, Money, useColors } from '@/constants/tokens';
import { CURRENCIES, type CurrencyCode } from '@/lib/currency';
import { db } from '@/lib/db';
import { formatFxRate, formatMoney } from '@/lib/format';
import { convert } from '@/lib/fx';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-context';

import { settingsStyles as styles } from './styles';

export function CurrencySection() {
  const colors = useColors();
  const { t } = useT();
  const {
    settings,
    rates,
    fxLastFetchedAt,
    getRateSource,
    changePrimary,
    setManualRate,
    clearManualRate,
    refetchRates,
  } = useSettings();
  const rateOverrideRef = useRef<RateOverrideSheetHandle>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const nonUsdCurrencies = CURRENCIES.filter((c) => c !== 'USD') as Exclude<CurrencyCode, 'USD'>[];
  const fxRowCurrencies = nonUsdCurrencies.filter((c) => c !== settings.primaryCurrency);
  const referenceFor = (cc: Exclude<CurrencyCode, 'USD'>): CurrencyCode =>
    cc === settings.primaryCurrency ? 'USD' : settings.primaryCurrency;

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
    const anyFallback = fxRowCurrencies.some((c) => getRateSource(c) === 'fallback');
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

  return (
    <>
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
          const reference = referenceFor(cc);
          const source = getRateSource(cc);
          const rateInRef = convert(1, cc, reference, rates);
          const displayRate = formatFxRate(rateInRef, reference);
          return (
            <Pressable
              key={cc}
              onPress={() => rateOverrideRef.current?.present(cc, rateInRef, reference)}
              style={({ pressed }) => ({
                paddingVertical: 10, opacity: pressed ? 0.6 : 1,
                flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
              })}
            >
              <Text style={{ color: colors.text }}>
                {t('currency.rate_row', { from: cc, value: displayRate, to: reference })}
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

      <RateOverrideSheet
        ref={rateOverrideRef}
        onSave={(cc, rateInRef, reference) => {
          const rateToUsd = reference === 'USD' ? rateInRef : rateInRef * rates[reference];
          setManualRate(cc, rateToUsd);
        }}
      />
    </>
  );
}
