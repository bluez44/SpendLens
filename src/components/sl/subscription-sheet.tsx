import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import * as ImagePicker from 'expo-image-picker';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { CategoryChip } from '@/components/sl/category-chip';
import { GradientFill } from '@/components/sl/gradient';
import { Icon } from '@/components/sl/icons';
import { PhotoTile } from '@/components/sl/photo-tile';
import { Text } from '@/components/sl/text';
import { AccentGradient, Money, Radius, W, useColors } from '@/constants/tokens';
import { STATIC_CATEGORIES } from '@/lib/categories';
import type { CategoryId } from '@/lib/categories';
import { insertUserCategory, listUserCategories, toCategoryObj } from '@/lib/user-categories';
import type { UserCategory } from '@/lib/user-categories';
import { useTransactions } from '@/lib/transactions-context';
import { CURRENCY_META, type CurrencyCode } from '@/lib/currency';
import { convert } from '@/lib/fx';
import { formatAmountInput, formatMoney } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { requestPermission } from '@/lib/notifications';
import { nextDueFromAnchor } from '@/lib/subscription-scheduler';
import type { NewSubscription, Subscription } from '@/lib/subscriptions';
import { useSettings } from '@/lib/settings-context';

import {
  AnchorDayPickerSheet,
  type AnchorDayPickerSheetHandle,
} from '@/components/sl/anchor-day-picker-sheet';
import {
  CurrencyPickerSheet,
  type CurrencyPickerSheetHandle,
} from '@/components/sl/currency-picker-sheet';

export interface SubscriptionSheetHandle {
  presentAdd(): void;
  presentEdit(sub: Subscription): void;
  dismiss(): void;
}

interface Props {
  onSave: (input: NewSubscription, id?: number) => void;
  onDelete: (id: number) => void;
  onPauseResume: (id: number, pause: boolean) => void;
}

export const SubscriptionSheet = forwardRef<SubscriptionSheetHandle, Props>(
  function SubscriptionSheet({ onSave, onDelete, onPauseResume }, ref) {
    const { t } = useT();
    const c = useColors();
    const { settings, rates } = useSettings();
    const { refreshUserCategories } = useTransactions();

    const sheet = useRef<BottomSheetModal>(null);
    const currencyPickerRef = useRef<CurrencyPickerSheetHandle>(null);
    const anchorPickerRef = useRef<AnchorDayPickerSheetHandle>(null);

    // Form state — mirrored in refs so save() always reads latest values
    const [editingId, setEditingId] = useState<number | undefined>(undefined);
    const [isPaused, setIsPaused] = useState(false);
    const [name, setName] = useState('');
    const [currency, setCurrency] = useState<CurrencyCode>(settings.primaryCurrency);
    const [amountDigits, setAmountDigits] = useState('');
    const [category, setCategory] = useState<CategoryId>('other');
    const [anchorDay, setAnchorDay] = useState(1);
    const [photoPath, setPhotoPath] = useState<string | null>(null);
    const [notify7, setNotify7] = useState(false);
    const [notify3, setNotify3] = useState(false);
    const [notify1, setNotify1] = useState(false);

    // Refs for save() to always see the latest values (avoids stale closure)
    const nameRef = useRef('');
    const currencyRef = useRef<CurrencyCode>(settings.primaryCurrency);
    const amountDigitsRef = useRef('');
    const categoryRef = useRef<CategoryId>('other');
    const anchorDayRef = useRef(1);
    const photoPathRef = useRef<string | null>(null);
    const notify7Ref = useRef(false);
    const notify3Ref = useRef(false);
    const notify1Ref = useRef(false);
    const editingIdRef = useRef<number | undefined>(undefined);

    const [userCategories, setUserCategories] = useState<UserCategory[]>(() => listUserCategories());
    const [customInput, setCustomInput] = useState('');

    const setNameSynced = (v: string) => { nameRef.current = v; setName(v); };
    const setCurrencySynced = (v: CurrencyCode) => { currencyRef.current = v; setCurrency(v); };
    const setAmountDigitsSynced = (v: string) => { amountDigitsRef.current = v; setAmountDigits(v); };
    const setCategorySynced = (v: CategoryId) => { categoryRef.current = v; setCategory(v); };
    const setAnchorDaySynced = (v: number) => { anchorDayRef.current = v; setAnchorDay(v); };
    const setPhotoPathSynced = (v: string | null) => { photoPathRef.current = v; setPhotoPath(v); };
    const setNotify7Synced = (v: boolean) => { notify7Ref.current = v; setNotify7(v); };
    const setNotify3Synced = (v: boolean) => { notify3Ref.current = v; setNotify3(v); };
    const setNotify1Synced = (v: boolean) => { notify1Ref.current = v; setNotify1(v); };
    const setEditingIdSynced = (v: number | undefined) => { editingIdRef.current = v; setEditingId(v); };

    const resetToDefaults = () => {
      setEditingIdSynced(undefined);
      setIsPaused(false);
      setNameSynced('');
      setCurrencySynced(settings.primaryCurrency);
      setAmountDigitsSynced('');
      setCategorySynced('other');
      setAnchorDaySynced(1);
      setPhotoPathSynced(null);
      setNotify7Synced(false);
      setNotify3Synced(false);
      setNotify1Synced(false);
      setCustomInput('');
    };

    useImperativeHandle(ref, () => ({
      presentAdd: () => {
        resetToDefaults();
        sheet.current?.present();
      },
      presentEdit: (sub: Subscription) => {
        setEditingIdSynced(sub.id);
        setIsPaused(sub.paused);
        setNameSynced(sub.name);
        setCurrencySynced(sub.originalCurrency);
        const meta = CURRENCY_META[sub.originalCurrency];
        const digits =
          meta.decimals === 2
            ? String(Math.round(sub.originalAmount * 100))
            : String(Math.round(sub.originalAmount));
        setAmountDigitsSynced(digits);
        setCategorySynced(sub.category);
        setAnchorDaySynced(sub.anchorDay);
        setPhotoPathSynced(sub.photoPath);
        setNotify7Synced(sub.notify7);
        setNotify3Synced(sub.notify3);
        setNotify1Synced(sub.notify1);
        setCustomInput('');
        sheet.current?.present();
      },
      dismiss: () => sheet.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (p: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      [],
    );

    // Derived display values from state (for rendering)
    const originalAmountDisplay = (() => {
      if (!amountDigits) return 0;
      const n = Number(amountDigits);
      return CURRENCY_META[currency].decimals === 2 ? n / 100 : n;
    })();

    const nextDuePreview = (() => {
      try {
        const d = nextDueFromAnchor(anchorDay, new Date());
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
      } catch {
        return '';
      }
    })();

    const handlePickPhoto = async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setPhotoPathSynced(result.assets[0].uri);
      }
    };

    const coerceNotifyFlags = async (
      n7: boolean,
      n3: boolean,
      n1: boolean,
    ): Promise<{ n7: boolean; n3: boolean; n1: boolean }> => {
      if (!n7 && !n3 && !n1) return { n7, n3, n1 };
      const granted = await requestPermission();
      if (!granted) {
        Alert.alert('', t('sub.perm_needed_body'));
        return { n7: false, n3: false, n1: false };
      }
      return { n7, n3, n1 };
    };

    const handleNotify7 = async () => {
      const next = !notify7Ref.current;
      const flags = await coerceNotifyFlags(next, notify3Ref.current, notify1Ref.current);
      setNotify7Synced(flags.n7);
      setNotify3Synced(flags.n3);
      setNotify1Synced(flags.n1);
    };

    const handleNotify3 = async () => {
      const next = !notify3Ref.current;
      const flags = await coerceNotifyFlags(notify7Ref.current, next, notify1Ref.current);
      setNotify7Synced(flags.n7);
      setNotify3Synced(flags.n3);
      setNotify1Synced(flags.n1);
    };

    const handleNotify1 = async () => {
      const next = !notify1Ref.current;
      const flags = await coerceNotifyFlags(notify7Ref.current, notify3Ref.current, next);
      setNotify7Synced(flags.n7);
      setNotify3Synced(flags.n3);
      setNotify1Synced(flags.n1);
    };

    function tryAddCustomCategory() {
      const name = customInput.trim();
      if (!name) return;
      try {
        const uc = insertUserCategory(name);
        setUserCategories((prev) => [...prev, uc]);
        setCategorySynced(uc.id);
        setCustomInput('');
        refreshUserCategories();
      } catch (err) {
        const existingUC = listUserCategories().find((c) => c.label === name);
        if (existingUC) {
          setCategorySynced(existingUC.id);
          setCustomInput('');
        } else {
          console.warn('Failed to add category', err);
        }
      }
    }

    // save() reads from refs for correctness when called synchronously after
    // state setters in tests (avoids stale closure over the previous render's
    // state values)
    const save = () => {
      const curName = nameRef.current;
      const curCurrency = currencyRef.current;
      const curAmountDigits = amountDigitsRef.current;
      const curCategory = categoryRef.current;
      const curAnchorDay = anchorDayRef.current;
      const curPhotoPath = photoPathRef.current;
      const curNotify7 = notify7Ref.current;
      const curNotify3 = notify3Ref.current;
      const curNotify1 = notify1Ref.current;
      const curEditingId = editingIdRef.current;

      if (!curName.trim()) return;

      const curOriginalAmount = (() => {
        if (!curAmountDigits) return 0;
        const n = Number(curAmountDigits);
        return CURRENCY_META[curCurrency].decimals === 2 ? n / 100 : n;
      })();
      if (!(curOriginalAmount > 0)) return;

      const dto: NewSubscription = {
        name: curName.trim(),
        category: curCategory,
        originalAmount: curOriginalAmount,
        originalCurrency: curCurrency,
        anchorDay: curAnchorDay,
        photoPath: curPhotoPath,
        notify7: curNotify7,
        notify3: curNotify3,
        notify1: curNotify1,
      };
      onSave(dto, curEditingId);
      sheet.current?.dismiss();
    };

    const confirmDelete = () => {
      const id = editingIdRef.current;
      if (id == null) return;
      Alert.alert(
        t('sub.delete_confirm_title'),
        t('sub.delete_confirm_body'),
        [
          { text: t('settings.cancel'), style: 'cancel' },
          {
            text: t('settings.delete'),
            style: 'destructive',
            onPress: () => {
              onDelete(id);
              sheet.current?.dismiss();
            },
          },
        ],
      );
    };

    const isEditing = editingId != null;
    const title = isEditing ? t('sub.edit_title') : t('sub.add_title');

    return (
      <>
        <BottomSheetModal
          ref={sheet}
          snapPoints={['90%']}
          backdropComponent={renderBackdrop}
          keyboardBehavior="interactive"
          backgroundStyle={{ backgroundColor: c.card }}
        >
          <BottomSheetScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {/* Title */}
            <Text style={[styles.title, { color: c.text }]}>{title}</Text>

            {/* Photo */}
            <Pressable
              onPress={handlePickPhoto}
              style={[styles.photoWrap, { borderColor: c.cardBorder }]}
            >
              {photoPath ? (
                <PhotoTile uri={photoPath} width="100%" height={120} radius={Radius.card} />
              ) : (
                <View style={[styles.photoPlaceholder, { backgroundColor: c.chipBg }]}>
                  <Icon name="camera" size={24} color={c.textSecondary} />
                  <Text style={{ color: c.textSecondary, fontSize: 13, marginTop: 4 }}>
                    {t('sub.field_photo')}
                  </Text>
                </View>
              )}
            </Pressable>

            {/* Name */}
            <Text style={[styles.label, { color: c.textSecondary }]}>{t('sub.field_name')}</Text>
            <BottomSheetTextInput
              testID="sub-name-input"
              value={name}
              onChangeText={setNameSynced}
              placeholder={t('sub.field_name')}
              placeholderTextColor={c.textSecondary}
              style={[styles.textInput, { color: c.text, borderColor: c.cardBorder }]}
            />

            {/* Amount + Currency */}
            <Text style={[styles.label, { color: c.textSecondary }]}>{t('sub.field_amount')}</Text>
            <View style={styles.amountRow}>
              {CURRENCY_META[currency].position === 'prefix' ? (
                <Text style={[styles.currencySymbol, { color: Money.expense }]}>
                  {CURRENCY_META[currency].symbol}
                </Text>
              ) : null}
              <BottomSheetTextInput
                testID="sub-amount-input"
                value={amountDigits ? formatAmountInput(amountDigits, currency) : ''}
                onChangeText={(v) => setAmountDigitsSynced(v.replace(/\D/g, ''))}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={c.textSecondary}
                style={[styles.amountInput, { color: c.text }]}
              />
              {CURRENCY_META[currency].position === 'suffix' ? (
                <Text style={[styles.currencySymbol, { color: Money.expense }]}>
                  {CURRENCY_META[currency].symbol}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => currencyPickerRef.current?.present(currency)}
              style={({ pressed }) => [
                styles.currencyChip,
                { backgroundColor: c.chipBg, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={{ color: c.text, fontWeight: W.semibold }}>{currency} ▾</Text>
            </Pressable>
            {currency !== settings.primaryCurrency && originalAmountDisplay > 0 ? (
              <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 4 }}>
                ≈ {formatMoney(
                  convert(originalAmountDisplay, currency, settings.primaryCurrency, rates),
                  settings.primaryCurrency,
                )}
              </Text>
            ) : null}

            {/* Category */}
            <Text style={[styles.label, { color: c.textSecondary }]}>{t('sub.field_category')}</Text>
            <View style={styles.chips}>
              {STATIC_CATEGORIES.map((cat) => (
                <CategoryChip
                  key={cat.id}
                  category={cat}
                  selected={category === cat.id}
                  onPress={() => setCategorySynced(cat.id)}
                />
              ))}
              {userCategories.map((uc) => {
                const cat = toCategoryObj(uc);
                return (
                  <CategoryChip
                    key={cat.id}
                    category={cat}
                    selected={category === cat.id}
                    onPress={() => setCategorySynced(cat.id)}
                  />
                );
              })}
            </View>
            {category === 'other' && (
              <View style={[styles.customCategoryRow, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
                <BottomSheetTextInput
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

            {/* Anchor day */}
            <Text style={[styles.label, { color: c.textSecondary }]}>{t('sub.field_anchor_day')}</Text>
            <Pressable
              onPress={() => anchorPickerRef.current?.present(anchorDay)}
              style={({ pressed }) => [
                styles.anchorRow,
                { backgroundColor: c.chipBg, borderColor: c.cardBorder, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={{ color: c.text, fontWeight: W.semibold }}>
                {t('sub.day_row', { day: anchorDay })}
              </Text>
              <Icon name="edit" size={16} color={c.textSecondary} />
            </Pressable>
            {nextDuePreview ? (
              <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 4 }}>
                {t('sub.next_due', { date: nextDuePreview })}
              </Text>
            ) : null}

            {/* Notify */}
            <Text style={[styles.label, { color: c.textSecondary }]}>{t('sub.notify_label')}</Text>
            <View style={styles.notifyRow}>
              <NotifyCheckbox
                testID="sub-notify-7"
                label={t('sub.notify_7')}
                checked={notify7}
                onPress={handleNotify7}
                c={c}
              />
              <NotifyCheckbox
                testID="sub-notify-3"
                label={t('sub.notify_3')}
                checked={notify3}
                onPress={handleNotify3}
                c={c}
              />
              <NotifyCheckbox
                testID="sub-notify-1"
                label={t('sub.notify_1')}
                checked={notify1}
                onPress={handleNotify1}
                c={c}
              />
            </View>

            {/* Save CTA */}
            <Pressable
              testID="sub-save-button"
              onPress={save}
              style={({ pressed }) => [styles.saveBtn, { opacity: pressed ? 0.85 : 1 }]}
            >
              <GradientFill />
              <Text style={styles.saveBtnLabel}>
                {isEditing ? t('sub.save_edit') : t('sub.save_add')}
              </Text>
            </Pressable>

            {/* Edit-mode extras */}
            {isEditing ? (
              <View style={styles.editExtras}>
                <Pressable
                  onPress={() => {
                    const id = editingIdRef.current;
                    if (id == null) return;
                    onPauseResume(id, !isPaused);
                    sheet.current?.dismiss();
                  }}
                  style={({ pressed }) => [
                    styles.editAction,
                    { backgroundColor: c.chipBg, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={{ color: c.text, fontWeight: W.semibold }}>
                    {isPaused ? t('sub.resume') : t('sub.pause')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={confirmDelete}
                  style={({ pressed }) => [
                    styles.editAction,
                    { backgroundColor: c.chipBg, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Text style={{ color: Money.expense, fontWeight: W.semibold }}>
                    {t('sub.delete')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </BottomSheetScrollView>
        </BottomSheetModal>

        <CurrencyPickerSheet
          ref={currencyPickerRef}
          onChoose={(cc) => setCurrencySynced(cc)}
        />
        <AnchorDayPickerSheet
          ref={anchorPickerRef}
          onChoose={(day) => setAnchorDaySynced(day)}
        />
      </>
    );
  },
);

function NotifyCheckbox({
  testID,
  label,
  checked,
  onPress,
  c,
}: {
  testID: string;
  label: string;
  checked: boolean;
  onPress: () => void;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.checkbox,
        {
          backgroundColor: checked ? c.chipBg : 'transparent',
          borderColor: checked ? AccentGradient[1] : c.cardBorder,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.checkIcon,
          { borderColor: checked ? AccentGradient[1] : c.cardBorder },
        ]}
      >
        {checked ? (
          <Icon name="check" size={12} color={AccentGradient[1]} strokeWidth={2.5} />
        ) : null}
      </View>
      <Text style={{ color: c.text, fontSize: 13, fontWeight: W.medium }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 8, paddingBottom: 40 },
  title: { fontSize: 18, fontWeight: W.bold, marginBottom: 8 },
  label: { fontSize: 11, fontWeight: W.bold, letterSpacing: 0.3, marginTop: 12 },
  photoWrap: { borderRadius: Radius.card, overflow: 'hidden', borderWidth: 1 },
  photoPlaceholder: {
    height: 100,
    borderRadius: Radius.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: Radius.button,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginTop: 4,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  amountInput: {
    fontSize: 36,
    fontWeight: W.extrabold,
    letterSpacing: -1,
    minWidth: 80,
    textAlign: 'center',
    padding: 0,
  },
  currencySymbol: { fontSize: 36, fontWeight: W.extrabold },
  currencyChip: {
    alignSelf: 'center',
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  customCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: Radius.button,
    borderWidth: 1,
  },
  anchorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: Radius.button,
    borderWidth: 1,
  },
  notifyRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.chip,
    borderWidth: 1.5,
  },
  checkIcon: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    borderRadius: Radius.button,
    overflow: 'hidden',
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  saveBtnLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: W.extrabold,
  },
  editExtras: { gap: 8, marginTop: 8 },
  editAction: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: Radius.button,
    alignItems: 'center',
  },
});
