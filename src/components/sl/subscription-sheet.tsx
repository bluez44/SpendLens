import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
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
import { insertUserCategory, listUserCategories, toCategoryObj } from '@/lib/user-categories';
import type { UserCategory } from '@/lib/user-categories';
import { useTransactions } from '@/lib/transactions-context';
import { CURRENCY_META } from '@/lib/currency';
import { convert } from '@/lib/fx';
import { formatAmountInput, formatMoney } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { requestPermission } from '@/lib/notifications';
import { nextDueFromAnchor } from '@/lib/subscription-scheduler';
import type { NewSubscription, Subscription } from '@/lib/subscriptions';
import { useSettings } from '@/lib/settings-context';
import { useSubscriptionFormState } from '@/lib/use-subscription-form-state';

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

    const {
      editingId, isPaused, name, currency, amountDigits, category, anchorDay,
      photoPath, notify7, notify3, notify1, customInput,
      setName, setCurrency, setAmountDigits, setCategory,
      setAnchorDay, setPhotoPath, setNotify7, setNotify3, setNotify1,
      setCustomInput,
      refs,
      resetToDefaults, loadFromSubscription,
    } = useSubscriptionFormState(settings.primaryCurrency);

    const [userCategories, setUserCategories] = useState<UserCategory[]>(() => listUserCategories());

    useImperativeHandle(ref, () => ({
      presentAdd: () => {
        resetToDefaults();
        sheet.current?.present();
      },
      presentEdit: (sub: Subscription) => {
        loadFromSubscription(sub);
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
      let result;
      try {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
        });
      } catch (err) {
        console.warn('ImagePicker.launchImageLibraryAsync failed', err);
        Alert.alert(t('common.photo_failed_title'), t('common.photo_failed_body'));
        return;
      }
      if (result.canceled || !result.assets[0]) return;
      const source = result.assets[0].uri;
      try {
        const extMatch = source.match(/\.([a-zA-Z0-9]{1,5})(?:$|\?)/);
        const ext = (extMatch?.[1] ?? 'jpg').toLowerCase();
        const dest = new File(Paths.document, `sub-${Crypto.randomUUID()}.${ext}`);
        new File(source).copySync(dest);
        setPhotoPath(dest.uri);
      } catch (err) {
        console.warn('Failed to copy picked photo, using source uri', err);
        setPhotoPath(source);
      }
    };

    const coerceNotifyFlags = async (
      n7: boolean,
      n3: boolean,
      n1: boolean,
    ): Promise<{ n7: boolean; n3: boolean; n1: boolean }> => {
      if (!n7 && !n3 && !n1) return { n7, n3, n1 };
      let granted = false;
      try {
        granted = await requestPermission();
      } catch (err) {
        console.warn('requestPermission threw', err);
        Alert.alert('', t('sub.perm_needed_body'));
        return { n7: false, n3: false, n1: false };
      }
      if (!granted) {
        Alert.alert('', t('sub.perm_needed_body'));
        return { n7: false, n3: false, n1: false };
      }
      return { n7, n3, n1 };
    };

    const handleNotify7 = async () => {
      const next = !refs.notify7.current;
      const flags = await coerceNotifyFlags(next, refs.notify3.current, refs.notify1.current);
      setNotify7(flags.n7);
      setNotify3(flags.n3);
      setNotify1(flags.n1);
    };

    const handleNotify3 = async () => {
      const next = !refs.notify3.current;
      const flags = await coerceNotifyFlags(refs.notify7.current, next, refs.notify1.current);
      setNotify7(flags.n7);
      setNotify3(flags.n3);
      setNotify1(flags.n1);
    };

    const handleNotify1 = async () => {
      const next = !refs.notify1.current;
      const flags = await coerceNotifyFlags(refs.notify7.current, refs.notify3.current, next);
      setNotify7(flags.n7);
      setNotify3(flags.n3);
      setNotify1(flags.n1);
    };

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
          Alert.alert(t('common.save_failed_title'), t('common.save_failed_body'));
        }
      }
    }

    // save() reads from refs for correctness when called synchronously after
    // state setters in tests (avoids stale closure over the previous render's
    // state values)
    const save = async () => {
      const curName = refs.name.current;
      const curCurrency = refs.currency.current;
      const curAmountDigits = refs.amountDigits.current;
      const curCategory = refs.category.current;
      const curAnchorDay = refs.anchorDay.current;
      const curPhotoPath = refs.photoPath.current;
      const curNotify7 = refs.notify7.current;
      const curNotify3 = refs.notify3.current;
      const curNotify1 = refs.notify1.current;
      const curEditingId = refs.editingId.current;

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
      try {
        await onSave(dto, curEditingId);
        sheet.current?.dismiss();
      } catch {
        // onSave surfaces the error to the user; keep the sheet open for retry
      }
    };

    const confirmDelete = () => {
      const id = refs.editingId.current;
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
              testID="sub-photo-pressable"
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
              onChangeText={setName}
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
                onChangeText={(v) => setAmountDigits(v.replace(/\D/g, '').slice(0, 15))}
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
                  onPress={() => setCategory(cat.id)}
                />
              ))}
              {userCategories.map((uc) => {
                const cat = toCategoryObj(uc);
                return (
                  <CategoryChip
                    key={cat.id}
                    category={cat}
                    selected={category === cat.id}
                    onPress={() => setCategory(cat.id)}
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
                  maxLength={30}
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
            {(() => {
              const hasName = name.trim().length > 0;
              const hasAmount = amountDigits.length > 0 && Number(amountDigits) > 0;
              const isValid = hasName && hasAmount;
              const hintKey = !hasName ? 'sub.hint_missing_name'
                : !hasAmount ? 'sub.hint_missing_amount'
                : null;
              return (
                <>
                  {hintKey ? (
                    <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 8, textAlign: 'center' }}>
                      {t(hintKey)}
                    </Text>
                  ) : null}
                  <Pressable
                    testID="sub-save-button"
                    onPress={save}
                    disabled={!isValid}
                    style={({ pressed }) => [
                      styles.saveBtn,
                      { opacity: !isValid ? 0.4 : (pressed ? 0.85 : 1) },
                    ]}
                  >
                    <GradientFill />
                    <Text style={styles.saveBtnLabel}>
                      {isEditing ? t('sub.save_edit') : t('sub.save_add')}
                    </Text>
                  </Pressable>
                </>
              );
            })()}

            {/* Edit-mode extras */}
            {isEditing ? (
              <View style={styles.editExtras}>
                <Pressable
                  onPress={() => {
                    const id = refs.editingId.current;
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
          onChoose={(cc) => setCurrency(cc)}
        />
        <AnchorDayPickerSheet
          ref={anchorPickerRef}
          onChoose={(day) => setAnchorDay(day)}
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
