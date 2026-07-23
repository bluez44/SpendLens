import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/sl/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton } from '@/components/sl/gradient';
import { CategoryChip } from '@/components/sl/category-chip';
import { Icon } from '@/components/sl/icons';
import { PhotoTile } from '@/components/sl/photo-tile';
import { Segmented } from '@/components/sl/segmented';
import { Money, Radius, useColors, W } from '@/constants/tokens';
import { STATIC_CATEGORIES } from '@/lib/categories';
import type { CategoryId } from '@/lib/categories';
import { deleteUserCategory, insertUserCategory, listUserCategories, toCategoryObj } from '@/lib/user-categories';
import type { UserCategory } from '@/lib/user-categories';
import { dayLabel, formatVND, toDateKey } from '@/lib/format';
import { decideBudgetAlert } from '@/lib/budget-alert';
import { fireBudgetAlert } from '@/lib/notifications';
import { useT } from '@/lib/i18n';
import type { NewTxn, Txn } from '@/lib/transactions';
import { useTransactions } from '@/lib/transactions-context';
import { useSettings } from '@/lib/settings-context';

function mergeExisting(existing: Txn | undefined): string {
  if (!existing) return '';
  const name = existing.name?.trim() ?? '';
  const note = existing.note?.trim() ?? '';
  if (name && note && name !== note) return `${name} · ${note}`;
  return name || note;
}

export default function EntryScreen() {
  const c = useColors();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ photo?: string; note?: string; id?: string }>();
  const { photo, id } = params;
  const { add, update, getById, transactions } = useTransactions();
  const { settings, update: updateSettings } = useSettings();

  const scrollRef = useRef<ScrollView>(null);
  const amountOffsetRef = useRef(0);
  const noteOffsetRef = useRef(0);

  const editing = id != null;
  const existing = useMemo(
    () => (editing ? getById(Number(id)) : undefined),
    [editing, id, getById]
  );
  const photoUri = photo ?? existing?.photoPath ?? undefined;

  const [isIncome, setIsIncome] = useState(existing?.isIncome ?? false);
  const [amount, setAmount] = useState(existing?.amount ?? 0);
  const [category, setCategory] = useState<CategoryId>(existing?.category ?? 'food');
  const [note, setNote] = useState(mergeExisting(existing) || params.note || '');
  const [userCategories, setUserCategories] = useState<UserCategory[]>(() => listUserCategories());
  const [customInput, setCustomInput] = useState('');

  function refreshUserCategories() {
    setUserCategories(listUserCategories());
  }

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
    } catch (err) {
      console.warn('Failed to add category', err);
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
          },
        },
      ],
    );
  }

  const canSave = amount > 0 && note.trim() !== '';

  const save = async () => {
    if (!canSave) return;
    let effectiveCategory: CategoryId = isIncome ? 'other' : category;
    if (!isIncome && category === 'other' && customInput.trim() !== '') {
      try {
        const uc = insertUserCategory(customInput.trim());
        setUserCategories((prev) => [...prev, uc]);
        effectiveCategory = uc.id;
      } catch (err) {
        // duplicate label: find existing and use its id
        const existingUC = listUserCategories().find((c) => c.label === customInput.trim());
        if (existingUC) effectiveCategory = existingUC.id;
        else console.warn('Failed to auto-create category', err);
      }
    }
    const payload: NewTxn = {
      date: editing && existing ? existing.date : toDateKey(new Date()),
      time: editing && existing ? existing.time : nowTime(),
      category: effectiveCategory,
      name: note.trim(),
      note: null,
      amount,
      isIncome,
      photoPath: photoUri ?? null,
    };
    if (editing) {
      update(Number(id), payload);
      router.back();
    } else {
      add(payload);
      if (!editing && !isIncome) {
        const budget = settings.monthlyBudget;
        if (budget > 0 && settings.budgetAlertsEnabled) {
          const currentMonth = toDateKey(new Date()).slice(0, 7);
          const spent = transactions
            .filter((tx) => !tx.isIncome && tx.date.slice(0, 7) === currentMonth)
            .reduce((s, tx) => s + tx.amount, 0) + amount;
          const fireLevel = decideBudgetAlert({
            spent,
            budget,
            notifiedMonth: settings.budgetNotifiedMonth,
            currentMonth,
          });
          if (fireLevel) {
            updateSettings('budgetNotifiedMonth', `${currentMonth}:${fireLevel}`);
            try {
              await fireBudgetAlert(fireLevel);
            } catch (err) {
              console.warn('Failed to fire budget alert', err);
            }
          }
        }
      }
      router.replace('/history');
    }
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
          <Pressable style={styles.close} onPress={() => router.back()}>
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
          <Text style={{ fontSize: 12, fontWeight: W.semibold, color: c.textSecondary, letterSpacing: 0.3 }}>{t('entry.amount_label')} <Text style={{ color: '#FB5B4D' }}>*</Text></Text>
          <View style={styles.amountRow}>
            <TextInput
              value={amount ? formatVND(amount).slice(0, -1) : ''}
              onChangeText={(v) => setAmount(Number(v.replace(/\D/g, '')) || 0)}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={c.textSecondary}
              onFocus={() => scrollToOffset(amountOffsetRef.current)}
              style={[styles.amountInput, { color: c.text }]}
            />
            <Text style={[styles.dong, { color: accent }]}>₫</Text>
          </View>
        </View>

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
                  style={{ flex: 1, fontSize: 14, color: c.text, padding: 0 }}
                />
                <Pressable onPress={tryAddCustomCategory} disabled={customInput.trim() === ''}>
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
          <Text style={{ fontSize: 11, fontWeight: W.bold, color: c.textSecondary, marginBottom: 3 }}>{t('entry.note_label')} <Text style={{ color: '#FB5B4D' }}>*</Text></Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={isIncome ? t('entry.note_placeholder_income') : t('entry.note_placeholder_expense')}
            placeholderTextColor={c.textSecondary}
            onFocus={() => scrollToOffset(noteOffsetRef.current)}
            style={{ fontSize: 14.5, fontWeight: W.semibold, color: c.text, padding: 0 }}
          />
        </View>

        {/* Date */}
        <View style={[styles.dateRow, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <Text style={{ fontSize: 13, fontWeight: W.semibold, color: c.textSecondary }}>{t('entry.date_label')}</Text>
          <Text style={{ fontSize: 14, fontWeight: W.bold, color: c.text }}>
            {editing && existing ? `${dayLabel(existing.date, toDateKey(new Date()))} · ${existing.time}` : `${t('day.today')} · ${nowTime()}`}
          </Text>
        </View>

        <GradientButton
          label={editing ? t('entry.save_update') : isIncome ? t('entry.save_income') : t('entry.save_expense')}
          onPress={save}
          disabled={!canSave}
          colors={isIncome ? (['#34C79A', '#1FA07A'] as const) : undefined}
          style={{ marginTop: 20, marginBottom: insets.bottom + 12 }}
        />
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function nowTime(): string {
  const d = new Date();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
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
