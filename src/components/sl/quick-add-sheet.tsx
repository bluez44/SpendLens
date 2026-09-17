import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetTextInput,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CategoryChip } from '@/components/sl/category-chip';
import { GradientButton } from '@/components/sl/gradient';
import { QuickAmountChips } from '@/components/sl/quick-amount-chips';
import { SuggestionChips } from '@/components/sl/suggestion-chips';
import { Text } from '@/components/sl/text';
import { useColors, W } from '@/constants/tokens';
import { STATIC_CATEGORIES, type CategoryId } from '@/lib/categories';
import { CURRENCY_META } from '@/lib/currency';
import { formatAmountInput } from '@/lib/format';
import { frequentEntries } from '@/lib/frequent-entries';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-context';
import { useTransactions } from '@/lib/transactions-context';
import { buildTxnPayload, useDraftTransaction } from '@/lib/use-draft-transaction';
import { useSaveTransaction } from '@/lib/use-save-transaction';
import { toCategoryObj } from '@/lib/user-categories';

export interface QuickAddDetailsParams {
  amount?: string;
  category?: string;
  note?: string;
}

export interface QuickAddSheetHandle {
  present: (initialNote?: string) => void;
  dismiss: () => void;
}

interface Props {
  onSaved?: () => void;
  onOpenDetails: (params: QuickAddDetailsParams) => void;
}

export const QuickAddSheet = forwardRef<QuickAddSheetHandle, Props>(
  function QuickAddSheet({ onSaved, onOpenDetails }, ref) {
    const colors = useColors();
    const sheetRef = useRef<BottomSheetModal>(null);
    const [session, setSession] = useState(0);
    const [initialNote, setInitialNote] = useState('');

    useImperativeHandle(ref, () => ({
      present: (note) => {
        setInitialNote(note ?? '');
        setSession((s) => s + 1);
        sheetRef.current?.present();
      },
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      [],
    );

    return (
      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.card }}
      >
        <BottomSheetView style={styles.body}>
          <QuickAddForm
            key={session}
            initialNote={initialNote}
            onSaved={() => {
              sheetRef.current?.dismiss();
              onSaved?.();
            }}
            onOpenDetails={(params) => {
              sheetRef.current?.dismiss();
              onOpenDetails(params);
            }}
          />
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

function QuickAddForm({
  initialNote,
  onSaved,
  onOpenDetails,
}: {
  initialNote: string;
  onSaved: () => void;
  onOpenDetails: (params: QuickAddDetailsParams) => void;
}) {
  const c = useColors();
  const { t } = useT();
  const { transactions, userCategories } = useTransactions();
  const { settings } = useSettings();
  const { saveNew } = useSaveTransaction();
  const primary = settings.primaryCurrency;

  const extras = useMemo(() => userCategories.map(toCategoryObj), [userCategories]);
  const categories = useMemo(() => [...STATIC_CATEGORIES, ...extras], [extras]);
  const suggestions = useMemo(() => frequentEntries(transactions), [transactions]);
  const defaultCategory = useMemo<CategoryId>(() => {
    const recent = transactions.find((tx) => !tx.isIncome)?.category;
    return recent && categories.some((cat) => cat.id === recent) ? recent : 'food';
  }, [transactions, categories]);

  const draft = useDraftTransaction({ primaryCurrency: primary, initialNote, initialCategory: defaultCategory });
  const [saving, setSaving] = useState(false);
  const meta = CURRENCY_META[draft.currency];

  const save = async () => {
    if (!draft.canSave || saving) return;
    setSaving(true);
    const payload = buildTxnPayload({
      selectedDate: new Date(),
      category: draft.category,
      note: draft.note,
      originalAmount: draft.originalAmount,
      currency: draft.currency,
      isIncome: false,
      photoPath: null,
    });
    const id = await saveNew(payload);
    setSaving(false);
    if (id !== null) onSaved();
  };

  const openDetails = () => {
    const params: QuickAddDetailsParams = { category: draft.category };
    if (draft.amountDigits && draft.currency === primary) params.amount = draft.amountDigits;
    if (draft.note.trim()) params.note = draft.note.trim();
    onOpenDetails(params);
  };

  return (
    <View style={styles.form}>
      <Text style={[styles.title, { color: c.text }]}>{t('quick_add.title')}</Text>

      <SuggestionChips entries={suggestions} extras={extras} onPick={draft.applySuggestion} />

      <View style={styles.amountRow}>
        {meta.position === 'prefix' ? <Text style={[styles.symbol, { color: c.text }]}>{meta.symbol}</Text> : null}
        <BottomSheetTextInput
          testID="quick-add-amount"
          autoFocus
          value={draft.amountDigits ? formatAmountInput(draft.amountDigits, draft.currency) : ''}
          onChangeText={draft.setAmountDigits}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={c.textSecondary}
          accessibilityLabel={t('entry.amount_label')}
          style={[styles.amountInput, { color: c.text }]}
        />
        {meta.position === 'suffix' ? <Text style={[styles.symbol, { color: c.text }]}>{meta.symbol}</Text> : null}
      </View>

      <QuickAmountChips currency={draft.currency} onPick={draft.setAmount} />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.categoryRow}>
        {categories.map((cat) => (
          <CategoryChip
            key={cat.id}
            category={cat}
            selected={draft.category === cat.id}
            onPress={() => draft.setCategory(cat.id)}
          />
        ))}
      </ScrollView>

      <BottomSheetTextInput
        testID="quick-add-note"
        value={draft.note}
        onChangeText={draft.setNote}
        placeholder={t('quick_add.note_placeholder')}
        placeholderTextColor={c.textSecondary}
        maxLength={140}
        style={[styles.note, { color: c.text, borderColor: c.hairline }]}
      />

      <View style={styles.actions}>
        <Pressable onPress={openDetails} hitSlop={8} accessibilityRole="button">
          <Text style={{ color: c.textSecondary, fontWeight: W.bold }}>{t('quick_add.details')}</Text>
        </Pressable>
        <GradientButton
          label={t('entry.save_expense')}
          onPress={save}
          disabled={!draft.canSave || saving}
          style={styles.saveButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 32 },
  form: { gap: 14 },
  title: { fontSize: 18, fontWeight: W.extrabold },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  symbol: { fontSize: 36, fontWeight: W.extrabold },
  amountInput: { fontSize: 36, fontWeight: W.extrabold, minWidth: 80, textAlign: 'center', padding: 0 },
  categoryRow: { gap: 8 },
  note: { borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  saveButton: { flex: 1 },
});
