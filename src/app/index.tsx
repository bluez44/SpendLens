import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GradientButton, Shutter } from '@/components/sl/gradient';
import { Icon } from '@/components/sl/icons';
import { Money, W } from '@/constants/tokens';
import { formatVND } from '@/lib/format';
import { filterRange } from '@/lib/transactions';
import { useTransactions } from '@/lib/transactions-context';

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const { transactions } = useTransactions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState<'off' | 'on'>('off');

  const todayExpense = useMemo(
    () => filterRange(transactions, 'day').filter((t) => !t.isIncome).reduce((s, t) => s + t.amount, 0),
    [transactions]
  );

  const capture = async () => {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.7 });
      router.push(photo?.uri ? { pathname: '/entry', params: { photo: photo.uri } } : '/entry');
    } catch {
      router.push('/entry');
    }
  };

  const granted = permission?.granted ?? false;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Top nav */}
      <View style={[styles.nav, { paddingTop: insets.top + 8 }]}>
        <RoundButton onPress={() => router.push('/home')}>
          <Icon name="home" />
        </RoundButton>
        <View style={styles.totalPill}>
          <Text style={{ fontSize: 12, fontWeight: W.semibold, color: 'rgba(255,255,255,0.65)' }}>Hôm nay</Text>
          <Text style={{ fontSize: 15, fontWeight: W.extrabold, color: Money.expenseOnDark }}>
            −{formatVND(todayExpense)}
          </Text>
        </View>
        <RoundButton onPress={() => router.push('/history')}>
          <Icon name="menu" />
        </RoundButton>
      </View>

      {/* Viewfinder */}
      <View style={styles.viewfinderWrap}>
        <View style={styles.viewfinder}>
          {granted ? (
            <>
              <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} flash={flash} />
              <Pressable
                style={styles.flashBtn}
                onPress={() => setFlash((f) => (f === 'off' ? 'on' : 'off'))}>
                <Icon name={flash === 'on' ? 'flash' : 'flash-off'} size={19} color="#fff" />
              </Pressable>
            </>
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.permission]}>
              <Text style={styles.permissionText}>
                {permission ? 'Cần quyền camera để chụp khoản chi' : 'Đang tải camera…'}
              </Text>
              {permission && !granted ? (
                <GradientButton label="Cho phép camera" onPress={requestPermission} style={{ marginTop: 16 }} />
              ) : null}
            </View>
          )}
          <View style={styles.caption}>
            <Text style={{ fontSize: 14, fontWeight: W.medium, color: 'rgba(255,255,255,0.72)' }}>Thêm ghi chú…</Text>
          </View>
        </View>
      </View>

      {/* Capture */}
      <View style={[styles.captureArea, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.captureRow}>
          <View style={styles.sideSlot} />
          <Shutter onPress={capture} />
          <Pressable
            style={[styles.sideSlot, styles.circleBtn]}
            onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}>
            <Icon name="flip" size={22} color="#fff" />
          </Pressable>
        </View>
        <Pressable style={styles.hint} onPress={() => router.push('/history')}>
          <Icon name="arrow-up" size={14} color="rgba(255,255,255,0.42)" />
          <Text style={{ fontSize: 12, fontWeight: W.semibold, color: 'rgba(255,255,255,0.42)' }}>
            Vuốt lên xem lịch sử
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function RoundButton({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.roundBtn, { opacity: pressed ? 0.7 : 1 }]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111111' },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  viewfinderWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  viewfinder: {
    width: '100%',
    aspectRatio: 1 / 1.12,
    borderRadius: 34,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
    justifyContent: 'flex-end',
  },
  permission: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  permissionText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: W.medium,
    textAlign: 'center',
  },
  caption: {
    margin: 12,
    paddingVertical: 13,
    paddingHorizontal: 17,
    borderRadius: 20,
    backgroundColor: 'rgba(18,18,18,0.42)',
  },
  captureArea: {
    alignItems: 'center',
    gap: 16,
    paddingTop: 24,
  },
  captureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingHorizontal: 52,
  },
  sideSlot: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtn: {
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  flashBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
