import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/sl/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CurrencyPickerSheet, type CurrencyPickerSheetHandle } from '@/components/sl/currency-picker-sheet';
import { GradientButton } from '@/components/sl/gradient';
import { CategoryChip } from '@/components/sl/category-chip';
import { Icon } from '@/components/sl/icons';
import { PhotoTile } from '@/components/sl/photo-tile';
import { QuickAmountChips } from '@/components/sl/quick-amount-chips';
import { Segmented } from '@/components/sl/segmented';
import { SuggestionChips } from '@/components/sl/suggestion-chips';
import { IncomeGradient, Money, Radius, useColors, W } from '@/constants/tokens';
import { STATIC_CATEGORIES } from '@/lib/categories';
import type { CategoryId } from '@/lib/categories';
import { CURRENCY_META } from '@/lib/currency';
import { frequentEntries } from '@/lib/frequent-entries';
import { convert } from '@/lib/fx';
import { deleteUserCategory, insertUserCategory, listUserCategories, toCategoryObj } from '@/lib/user-categories';
import type { UserCategory } from '@/lib/user-categories';
import { dayLabel, formatAmountInput, formatHHMM, formatMoney, toDateKey } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { useTransactions } from '@/lib/transactions-context';
import { useSettings } from '@/lib/settings-context';
import { useSaveTransaction } from '@/lib/use-save-transaction';
import { buildTxnPayload, useDraftTransaction } from '@/lib/use-draft-transaction';

export default function EntryScreen() {
  const c = useColors();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ photo?: string; note?: string; id?: string; amount?: string; category?: string }>();
  const { photo, id } = params;
  const { getById, transactions, refreshUserCategories } = useTransactions();
  const { settings, rates } = useSettings();
  const { saveNew, saveEdit } = useSaveTransaction();

  const scrollRef = useRef<ScrollView>(null);
  const amountOffsetRef = useRef(0);
  const noteOffsetRef = useRef(0);

  const editing = id != null;
  const existing = useMemo(
    () => (editing ? getById(Number(id)) : undefined),
    [editing, id, getById]
  );
  const photoUri = photo ?? existing?.photoPath ?? undefined;
  const [userCategories, setUserCategories] = useState<UserCategory[]>(() => listUserCategories());

  const initialCategory = ((): CategoryId | undefined => {
    const raw = params.category;
    if (editing || !raw) return undefined;
    const known = [...STATIC_CATEGORIES, ...userCategories.map(toCategoryObj)].some((cat) => cat.id === raw);
    return known ? (raw as CategoryId) : 'food';
  })();

  const draft = useDraftTransaction({
    existing,
    primaryCurrency: settings.primaryCurrency,
    initialNote: params.note,
    initialAmountDigits: editing ? undefined : params.amount,
    initialCategory,
  });
  const {
    isIncome, setIsIncome,
    currency, setCurrency,
    amountDigits, setAmountDigits,
    category, setCategory,
    note, setNote,
    selectedDate, setSelectedDate,
    originalAmount, canSave,
    applySuggestion, setAmount,
  } = draft;

  const suggestions = useMemo(() => frequentEntries(transactions), [transactions]);

  const [pickerStep, setPickerStep] = useState<'idle' | 'date' | 'time' | 'datetime'>('idle');
  const currencyPickerRef = useRef<CurrencyPickerSheetHandle>(null);
  const [customInput, setCustomInput] = useState('');

  const accent = isIncome ? Money.income : Money.expense;

  function scrollToOffset(y: number) {
    if (Platform.OS === 'ios') return;  // iOS auto-adjust handles it
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true });
    }, 250);
  }

  function tryAddCustomCategory() {
    const name = customInput.trim();
    if (!name) return;
    try {
      const uc = insertUserCategory(name);
      setUserCategories((prev) => [...prev, uc]);
      setCategory(uc.id);
      setCustomInput('');
      refreshUserCategories();
    } catch (err) {
      const existingUC = listUserCategories().find((c) => c.label === name);
      if (existingUC) {
        setCategory(existingUC.id);
        setCustomInput('');
      } else {
        console.warn('Failed to add category', err);
      }
    }
  }

  function confirmDeleteUserCategory(uc: UserCategory) {
    Alert.alert(
      t('entry.custom_category_delete_title'),
      t('entry.custom_category_delete_body'),
      [
        { text: t('settings.cancel'), style: 'cancel' },
        {
          text: t('settings.delete'),
          style: 'destructive',
          onPress: () => {
            deleteUserCategory(uc.id);
            setUserCategories((prev) => prev.filter((c) => c.id !== uc.id));
            if (category === uc.id) setCategory('food');
            refreshUserCategories();
          },
        },
      ],
    );
  }

  const save = async () => {
    if (!canSave) return;
    let effectiveCategory: CategoryId = isIncome ? 'other' : category;
    if (!isIncome && category === 'other' && customInput.trim() !== '') {
      try {
        const uc = insertUserCategory(customInput.trim());
        setUserCategories((prev) => [...prev, uc]);
        effectiveCategory = uc.id;
        refreshUserCategories();
      } catch (err) {
        // duplicate label: find existing and use its id
        const existingUC = listUserCategories().find((c) => c.label === customInput.trim());
        if (existingUC) effectiveCategory = existingUC.id;
        else console.warn('Failed to auto-create category', err);
      }
    }
    const payload = buildTxnPayload({
      selectedDate,
      category: effectiveCategory,
      note,
      originalAmount,
      currency,
      isIncome,
      photoPath: photoUri ?? null,
    });
    if (editing) {
      if (await saveEdit(Number(id), payload)) router.back();
      return;
    }
    if ((await saveNew(payload)) !== null) router.replace('/');
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
        style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {/* Photo */}
        <View style={styles.photoWrap}>
          <PhotoTile uri={photoUri} width="100%" height={150} radius={Radius.cardLg} />
          <Pressable
            style={styles.close}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('home.close_a11y')}
            onPress={() => router.back()}>
            <Icon name="close" size={16} color="#fff" />
          </Pressable>
        </View>

        {/* Chi / Thu */}
        <View style={{ marginTop: 16 }}>
          <Segmented options={[t('entry.tab_expense'), t('entry.tab_income')]} value={isIncome ? 1 : 0} onChange={(i) => setIsIncome(i === 1)} />
        </View>

        {/* Amount */}
        <View
          style={styles.amountBlock}
          onLayout={(e) => { amountOffsetRef.current = e.nativeEvent.layout.y; }}
        >
          <Text style={{ fontSize: 12, fontWeight: W.semibold, color: c.textSecondary, letterSpacing: 0.3 }}>{t('entry.amount_label')} <Text style={{ color: Money.expense }}>*</Text></Text>
          <View style={styles.amountRow}>
            {CURRENCY_META[currency].position === 'prefix' ? (
              <Text style={[styles.dong, { color: accent }]}>{CURRENCY_META[currency].symbol}</Text>
            ) : null}
            <TextInput
              value={amountDigits ? formatAmountInput(amountDigits, currency) : ''}
              onChangeText={setAmountDigits}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={c.textSecondary}
              onFocus={() => scrollToOffset(amountOffsetRef.current)}
              autoFocus={!editing}
              style={[styles.amountInput, { color: c.text }]}
            />
            {CURRENCY_META[currency].position === 'suffix' ? (
              <Text style={[styles.dong, { color: accent }]}>{CURRENCY_META[currency].symbol}</Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => currencyPickerRef.current?.present(currency)}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.choose_currency')}
            style={({ pressed }) => [
              styles.currencyChip,
              { backgroundColor: c.chipBg, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={{ color: c.text, fontWeight: W.semibold }}>{currency} ▾</Text>
          </Pressable>
          {currency !== settings.primaryCurrency && originalAmount > 0 ? (
            <Text style={{ color: c.textSecondary, marginTop: 4, fontSize: 12 }}>
              ≈ {formatMoney(convert(originalAmount, currency, settings.primaryCurrency, rates), settings.primaryCurrency)}
            </Text>
          ) : null}
        </View>

        {!editing && !isIncome ? (
          <View style={styles.suggestions}>
            <SuggestionChips
              entries={suggestions}
              extras={userCategories.map(toCategoryObj)}
              onPick={applySuggestion}
            />
            <QuickAmountChips currency={currency} onPick={setAmount} />
          </View>
        ) : null}

        {/* Categories (expense only) */}
        {!isIncome ? (
          <>
            <View style={styles.chips}>
              {STATIC_CATEGORIES.map((cat) => (
                <CategoryChip
                  key={cat.id}
                  category={cat}
                  selected={category === cat.id}
                  onPress={() => setCategory(cat.id)}
                />
              ))}
              {userCategories.map((uc) => {
                const cat = toCategoryObj(uc);
                return (
                  <Pressable
                    key={cat.id}
                    onLongPress={() => confirmDeleteUserCategory(uc)}
                    delayLongPress={500}
                  >
                    <CategoryChip
                      category={cat}
                      selected={category === cat.id}
                      onPress={() => setCategory(cat.id)}
                    />
                  </Pressable>
                );
              })}
            </View>

            {category === 'other' && (
              <View style={[styles.field, { backgroundColor: c.card, borderColor: c.cardBorder, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                <TextInput
                  value={customInput}
                  onChangeText={setCustomInput}
                  placeholder={t('entry.custom_category_placeholder')}
                  placeholderTextColor={c.textSecondary}
                  maxLength={30}
                  style={{ flex: 1, fontSize: 14, color: c.text, padding: 0 }}
                />
                <Pressable
                  onPress={tryAddCustomCategory}
                  disabled={customInput.trim() === ''}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={t('a11y.confirm_category')}>
                  <Icon name="check" size={20} color={customInput.trim() === '' ? c.textSecondary : c.text} />
                </Pressable>
              </View>
            )}
          </>
        ) : null}

        {/* Note */}
        <View
          style={[styles.field, { backgroundColor: c.card, borderColor: c.cardBorder }]}
          onLayout={(e) => { noteOffsetRef.current = e.nativeEvent.layout.y; }}
        >
          <Text style={{ fontSize: 11, fontWeight: W.bold, color: c.textSecondary, marginBottom: 3 }}>{t('entry.note_label')}</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={isIncome ? t('entry.note_placeholder_income') : t('entry.note_placeholder_expense')}
            placeholderTextColor={c.textSecondary}
            maxLength={500}
            onFocus={() => scrollToOffset(noteOffsetRef.current)}
            style={{ fontSize: 14.5, fontWeight: W.semibold, color: c.text, padding: 0 }}
          />
        </View>

        {/* Date */}
        <Pressable
          style={[styles.dateRow, { backgroundColor: c.card, borderColor: c.cardBorder }]}
          onPress={() => setPickerStep(Platform.OS === 'ios' ? 'datetime' : 'date')}
        >
          <Text style={{ fontSize: 13, fontWeight: W.semibold, color: c.textSecondary }}>{t('entry.date_label')}</Text>
          <Text style={{ fontSize: 14, fontWeight: W.bold, color: c.text }}>
            {`${dayLabel(toDateKey(selectedDate), toDateKey(new Date()))} · ${formatHHMM(selectedDate)}`}
          </Text>
        </Pressable>

        {pickerStep === 'datetime' && (
          <DateTimePicker
            value={selectedDate}
            mode="datetime"
            maximumDate={new Date()}
            onValueChange={(_, d) => {
              setPickerStep('idle');
              if (d) setSelectedDate(d);
            }}
          />
        )}
        {pickerStep === 'date' && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            maximumDate={new Date()}
            onValueChange={(_, d) => {
              if (!d) { setPickerStep('idle'); return; }
              const merged = new Date(d);
              merged.setHours(selectedDate.getHours(), selectedDate.getMinutes());
              setSelectedDate(merged);
              setPickerStep('time');
            }}
          />
        )}
        {pickerStep === 'time' && (
          <DateTimePicker
            value={selectedDate}
            mode="time"
            is24Hour
            onValueChange={(_, d) => {
              setPickerStep('idle');
              if (!d) return;
              const merged = new Date(selectedDate);
              merged.setHours(d.getHours(), d.getMinutes());
              setSelectedDate(merged);
            }}
          />
        )}

        {!canSave ? (
          <Text style={{
            color: c.textSecondary, fontSize: 12, textAlign: 'center', marginTop: 12,
          }}>
            {t('entry.hint_missing_amount')}
          </Text>
        ) : null}
        <GradientButton
          label={editing ? t('entry.save_update') : isIncome ? t('entry.save_income') : t('entry.save_expense')}
          onPress={save}
          disabled={!canSave}
          colors={isIncome ? IncomeGradient : undefined}
          style={{ marginTop: canSave ? 20 : 8, marginBottom: insets.bottom + 12 }}
        />
      </ScrollView>
      </KeyboardAvoidingView>
      <CurrencyPickerSheet ref={currencyPickerRef} onChoose={(cc) => setCurrency(cc)} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingTop: 6 },
  photoWrap: { position: 'relative' },
  close: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountBlock: { alignItems: 'center', marginTop: 20 },
  amountRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', marginTop: 2 },
  amountInput: {
    fontSize: 44,
    fontWeight: W.extrabold,
    letterSpacing: -1,
    minWidth: 80,
    textAlign: 'center',
    padding: 0,
  },
  dong: { fontSize: 44, fontWeight: W.extrabold },
  currencyChip: {
    alignSelf: 'center',
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  suggestions: { marginTop: 14, gap: 10 },
  field: {
    marginTop: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
});
