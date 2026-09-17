import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as MediaLibrary from 'expo-media-library';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import Share from 'react-native-share';
import ViewShot from 'react-native-view-shot';
import type { ViewShotRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientFill } from '@/components/sl/gradient';
import { RecapCard } from '@/components/share/recap-card';
import { StreakCard } from '@/components/share/streak-card';
import { Text } from '@/components/sl/text';
import { Icon } from '@/components/sl/icons';
import { Radius, useColors, W } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import { useSettings } from '@/lib/settings-context';
import type { CardType } from '@/lib/share-cards';
import { useShareCard } from '@/lib/use-share-card';

function normalizeType(raw: string | string[] | undefined): CardType {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return s === 'streak' ? 'streak' : 'recap';
}

export default function ShareScreen() {
  const c = useColors();
  const { t } = useT();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: string }>();
  const type = normalizeType(params.type);
  const { settings, update } = useSettings();
  const { shareData } = useShareCard(type);

  const viewShotRef = useRef<ViewShotRef>(null);
  const [busy, setBusy] = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  const hideAmounts = settings.shareHideAmounts;

  async function capturePng(): Promise<string> {
    const uri = await viewShotRef.current?.capture({
      format: 'png',
      quality: 1,
      width: 1080,
      height: 1920,
      result: 'tmpfile',
    });
    if (!uri) throw new Error('capture returned undefined');
    return uri;
  }

  async function handleShare() {
    if (busy) return;
    setBusy(true);
    let uri: string | null = null;
    try {
      uri = await capturePng();
      await Share.open({ url: uri, type: 'image/png' });
    } catch (err) {
      const msg = String((err as { message?: string })?.message ?? '');
      if (msg.includes('User did not share') || msg.includes('CANCELLED')) {
        // silent — user cancelled
      } else if (uri === null) {
        Alert.alert(t('share.capture_failed_title'), t('share.capture_failed_body'));
      } else {
        Alert.alert(t('share.share_failed_title'), t('share.share_failed_body'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveToGallery() {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('share.gallery_perm_title'), t('share.gallery_perm_body'));
        return;
      }
      const uri = await capturePng();
      await MediaLibrary.saveToLibraryAsync(uri);
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 2000);
    } catch {
      Alert.alert(t('share.save_failed_title'), t('share.save_failed_body'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.bg, paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: c.text }]}>{t('share.preview_title')}</Text>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('home.close_a11y')}
          style={[styles.iconBtn, { backgroundColor: c.segment }]}>
          <Icon name="close" size={18} color={c.text} />
        </Pressable>
      </View>

      <View style={styles.previewWrap}>
        <ViewShot ref={viewShotRef} style={styles.viewshot}>
          {shareData.type === 'recap'
            ? <RecapCard data={shareData.data} hideAmounts={hideAmounts} />
            : <StreakCard data={shareData.data} />}
        </ViewShot>
      </View>

      <View style={[styles.controls, { paddingBottom: insets.bottom + 20 }]}>
        {shareData.type === 'recap' ? (
          <View style={styles.toggleRow}>
            <Text style={{ color: c.text, fontWeight: W.medium }}>{t('share.hide_amounts')}</Text>
            <Switch
              value={hideAmounts}
              onValueChange={(v) => update('shareHideAmounts', v)}
            />
          </View>
        ) : null}

        <Pressable
          testID="save-button"
          onPress={handleSaveToGallery}
          disabled={busy}
          style={({ pressed }) => [
            styles.secondaryBtn,
            { backgroundColor: c.segment, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={{ color: c.text, fontWeight: W.semibold }}>
            {savedTick ? `✓ ${t('share.saved_toast')}` : t('share.save_to_gallery')}
          </Text>
        </Pressable>

        <Pressable
          testID="share-button"
          onPress={handleShare}
          disabled={busy}
          style={({ pressed }) => [styles.primaryBtn, { opacity: pressed ? 0.85 : 1 }]}
        >
          <GradientFill />
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnLabel}>{t('share.share_button')}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTitle: { fontSize: 18, fontWeight: W.extrabold },
  iconBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  previewWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  viewshot: {},
  controls: {
    padding: 20,
    gap: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  secondaryBtn: {
    paddingVertical: 14,
    borderRadius: Radius.button,
    alignItems: 'center',
  },
  primaryBtn: {
    paddingVertical: 16,
    borderRadius: Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  primaryBtnLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: W.extrabold,
  },
});
