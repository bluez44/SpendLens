import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Alert, Dimensions, Pressable, StyleSheet, Switch, View } from 'react-native';
import ViewShot from 'react-native-view-shot';

import { GradientButton } from '@/components/sl/gradient';
import { Icon } from '@/components/sl/icons';
import { Text } from '@/components/sl/text';
import { useColors, W } from '@/constants/tokens';
import { categoryOf } from '@/lib/categories';
import type { Category } from '@/lib/categories';
import { toDateKey } from '@/lib/format';
import { useT } from '@/lib/i18n';
import {
  buildShareOverlay,
  DEFAULT_SHARE_TOGGLES,
  shareTransactionImage,
} from '@/lib/share-transaction';
import type { ShareToggles } from '@/lib/share-transaction';
import type { Txn } from '@/lib/transactions';
import type { ViewShotRef } from 'react-native-view-shot';

export interface ShareSheetHandle {
  present: (txn: Txn) => void;
  dismiss: () => void;
}

interface Props {
  extras?: Category[];
}

const PREVIEW_WIDTH = Math.min(Dimensions.get('window').width - 48, 300);
const PREVIEW_HEIGHT = PREVIEW_WIDTH * (16 / 9);
const MAX_SHEET_HEIGHT = Dimensions.get('window').height * 0.85;

export const ShareSheet = forwardRef<ShareSheetHandle, Props>(
  function ShareSheet({ extras = [] }, ref) {
    const { t } = useT();
    const colors = useColors();
    const sheetRef = useRef<BottomSheetModal>(null);
    const viewShotRef = useRef<ViewShotRef>(null);
    const [txn, setTxn] = useState<Txn | null>(null);
    const [toggles, setToggles] = useState<ShareToggles>(DEFAULT_SHARE_TOGGLES);

    useImperativeHandle(ref, () => ({
      present: (nextTxn) => {
        setTxn(nextTxn);
        setToggles(DEFAULT_SHARE_TOGGLES);
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

    const onShare = async () => {
      try {
        const uri = await viewShotRef.current?.capture();
        if (!uri) throw new Error('capture failed');
        sheetRef.current?.dismiss();
        await shareTransactionImage(uri);
      } catch {
        Alert.alert(t('share.error_title'), t('share.error_body'));
      }
    };

    const cat = txn ? categoryOf(txn.category, extras) : null;
    const overlay = txn && cat ? buildShareOverlay(txn, toggles, cat, toDateKey(new Date())) : null;

    return (
      <BottomSheetModal
        ref={sheetRef}
        enableDynamicSizing
        maxDynamicContentSize={MAX_SHEET_HEIGHT}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.bg }}
        handleIndicatorStyle={{ backgroundColor: colors.hairline }}
        handleStyle={{ backgroundColor: colors.bg }}>
        <BottomSheetScrollView
          style={{ backgroundColor: colors.bg }}
          contentContainerStyle={styles.body}>
          {txn && txn.photoPath && cat && overlay ? (
            <>
              <View style={styles.header}>
                <Pressable
                  style={[styles.closeBtn, { backgroundColor: colors.segment }]}
                  hitSlop={8}
                  accessibilityLabel={t('share.close_a11y')}
                  onPress={() => sheetRef.current?.dismiss()}>
                  <Icon name="close" size={16} color={colors.text} />
                </Pressable>
                <Text style={{ fontSize: 18, fontWeight: W.bold, color: colors.text }}>
                  {t('share.sheet_title')}
                </Text>
              </View>

              <ViewShot
                ref={viewShotRef}
                options={{ format: 'png', quality: 1, result: 'tmpfile' }}
                style={[styles.preview, { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT }]}>
                <Image source={{ uri: txn.photoPath }} style={StyleSheet.absoluteFill} contentFit="cover" />
                <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.bottomFade} />
                <View style={styles.overlayInfo}>
                  {overlay.categoryText ? (
                    <View style={[styles.categoryChip, { backgroundColor: cat.chip }]}>
                      <Text style={{ fontSize: 12, fontWeight: W.bold, color: cat.fg }}>
                        {overlay.categoryText}
                      </Text>
                    </View>
                  ) : null}
                  {overlay.amountText ? <Text style={styles.amountText}>{overlay.amountText}</Text> : null}
                  {overlay.nameText ? (
                    <Text style={styles.nameText} numberOfLines={2}>{overlay.nameText}</Text>
                  ) : null}
                  {overlay.dateText ? <Text style={styles.dateText}>{overlay.dateText}</Text> : null}
                </View>
              </ViewShot>

              <View style={styles.toggles}>
                <ToggleRow
                  label={t('share.toggle_date')}
                  value={toggles.showDate}
                  onValueChange={(v) => setToggles((s) => ({ ...s, showDate: v }))}
                />
                <ToggleRow
                  label={t('share.toggle_amount')}
                  value={toggles.showAmount}
                  onValueChange={(v) => setToggles((s) => ({ ...s, showAmount: v }))}
                />
                <ToggleRow
                  label={t('share.toggle_category')}
                  value={toggles.showCategory}
                  onValueChange={(v) => setToggles((s) => ({ ...s, showCategory: v }))}
                />
                <ToggleRow
                  label={t('share.toggle_name')}
                  value={toggles.showName}
                  onValueChange={(v) => setToggles((s) => ({ ...s, showName: v }))}
                />
              </View>

              <GradientButton label={t('share.share_btn')} onPress={onShare} />
            </>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheetModal>
    );
  },
);

function ToggleRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  const colors = useColors();
  return (
    <View style={[styles.toggleRow, { borderColor: colors.hairline }]}>
      <Text style={{ color: colors.text, fontWeight: W.medium }}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 16, alignItems: 'center' },
  header: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 12 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  preview: { borderRadius: 20, overflow: 'hidden', backgroundColor: '#111' },
  bottomFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '45%' },
  overlayInfo: { position: 'absolute', left: 16, right: 16, bottom: 16, gap: 6 },
  categoryChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  amountText: { color: '#fff', fontSize: 26, fontWeight: W.extrabold },
  nameText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: W.medium },
  dateText: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: W.medium },
  toggles: { alignSelf: 'stretch', gap: 10 },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
});
