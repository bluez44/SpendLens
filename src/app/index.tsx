import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Dimensions, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EdgeInsets } from 'react-native-safe-area-context';

import { GradientButton, Shutter } from '@/components/sl/gradient';
import { Icon } from '@/components/sl/icons';
import { TodayBadge } from '@/components/sl/today-badge';
import { TxnCard } from '@/components/sl/txn-card';
import { Money, W, useColors } from '@/constants/tokens';
import { formatVND, toDateKey } from '@/lib/format';
import type { Txn } from '@/lib/transactions';
import { useTransactions } from '@/lib/transactions-context';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const { transactions } = useTransactions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [note, setNote] = useState('');
  const [noteFocused, setNoteFocused] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const todayKey = toDateKey(new Date());
  const todayTxns = useMemo(
    () => transactions.filter((t) => t.date === todayKey),
    [transactions, todayKey]
  );

  const todayExpense = useMemo(
    () => transactions
      .filter((t) => t.date === todayKey && !t.isIncome)
      .reduce((s, t) => s + t.amount, 0),
    [transactions, todayKey]
  );

  type PageItem =
    | { type: 'camera' }
    | { type: 'empty' }
    | { type: 'txn'; txn: Txn };

  const pages = useMemo<PageItem[]>(
    () => (
      todayTxns.length === 0
        ? [{ type: 'camera' }, { type: 'empty' }]
        : [{ type: 'camera' }, ...todayTxns.map((t) => ({ type: 'txn' as const, txn: t }))]
    ),
    [todayTxns]
  );

  const keyExtractor = useCallback(
    (item: PageItem, i: number) =>
      item.type === 'txn' ? `txn-${item.txn.id}` : `${item.type}-${i}`,
    []
  );

  const capture = async () => {
    const currentNote = note;
    setNoteFocused(false);
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.7, shutterSound: false });
      router.push({
        pathname: '/entry',
        params: photo?.uri
          ? { photo: photo.uri, note: currentNote }
          : currentNote ? { note: currentNote } : {},
      });
    } catch {
      router.push({ pathname: '/entry', params: currentNote ? { note: currentNote } : {} });
    }
  };

  const granted = permission?.granted ?? false;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <FlatList
        ref={flatListRef}
        data={pages}
        keyExtractor={keyExtractor}
        renderItem={({ item }) => {
          if (item.type === 'camera')
            return (
              <CameraPage
                insets={insets}
                permission={permission}
                requestPermission={requestPermission}
                granted={granted}
                facing={facing}
                setFacing={setFacing}
                flash={flash}
                setFlash={setFlash}
                cameraRef={cameraRef}
                capture={capture}
                note={note}
                noteFocused={noteFocused}
                setNote={setNote}
                setNoteFocused={setNoteFocused}
                todayExpense={todayExpense}
              />
            );
          if (item.type === 'empty') return <EmptyTodayCard />;
          return <TxnCard txn={item.txn} />;
        }}
        pagingEnabled
        snapToInterval={SCREEN_HEIGHT}
        snapToAlignment="start"
        decelerationRate="normal"
        disableIntervalMomentum
        showsVerticalScrollIndicator={false}
        scrollEnabled={!noteFocused && !isSnapping}
        onScroll={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / SCREEN_HEIGHT);
          if (idx !== currentIndex) setCurrentIndex(idx);
        }}
        onMomentumScrollBegin={() => setIsSnapping(true)}
        onMomentumScrollEnd={(e) => {
          setIsSnapping(false);
          setCurrentIndex(Math.round(e.nativeEvent.contentOffset.y / SCREEN_HEIGHT));
        }}
        scrollEventThrottle={16}
      />
      {currentIndex > 0 && (
        <Pressable
          style={[styles.backToCamera, { bottom: insets.bottom + 24 }]}
          onPress={() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true })}
          accessibilityLabel="Về camera">
          <Icon name="camera" size={22} color="#fff" />
        </Pressable>
      )}
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

function CameraPage({
  insets, permission, requestPermission, granted,
  facing, setFacing, flash, setFlash,
  cameraRef, capture,
  note, noteFocused, setNote, setNoteFocused,
  todayExpense,
}: {
  insets: EdgeInsets;
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: ReturnType<typeof useCameraPermissions>[1];
  granted: boolean;
  facing: 'back' | 'front';
  setFacing: React.Dispatch<React.SetStateAction<'back' | 'front'>>;
  flash: 'off' | 'on';
  setFlash: React.Dispatch<React.SetStateAction<'off' | 'on'>>;
  cameraRef: React.RefObject<CameraView | null>;
  capture: () => Promise<void>;
  note: string;
  noteFocused: boolean;
  setNote: (v: string) => void;
  setNoteFocused: (v: boolean) => void;
  todayExpense: number;
}) {
  return (
    <View style={{ height: SCREEN_HEIGHT, backgroundColor: '#111111' }}>
      {/* Top nav */}
      <View style={[styles.nav, { paddingTop: insets.top + 8 }]}>
        <RoundButton onPress={() => router.push('/home')}><Icon name="home" /></RoundButton>
        <View style={styles.totalPill}>
          <Text style={{ fontSize: 12, fontWeight: W.semibold, color: 'rgba(255,255,255,0.65)' }}>Hôm nay</Text>
          <Text style={{ fontSize: 15, fontWeight: W.extrabold, color: Money.expenseOnDark }}>
            −{formatVND(todayExpense)}
          </Text>
        </View>
        <RoundButton onPress={() => router.push('/history')}><Icon name="menu" /></RoundButton>
      </View>

      {/* Viewfinder */}
      <View style={styles.viewfinderWrap}>
        <View style={styles.viewfinder}>
          {granted ? (
            <>
              <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} flash={flash} />
              <Pressable style={styles.flashBtn} onPress={() => setFlash((f) => (f === 'off' ? 'on' : 'off'))}>
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

          <Pressable
            style={styles.noteTapZone}
            onPress={() => setNoteFocused(true)}
            pointerEvents={noteFocused ? 'none' : 'auto'}
          />

          {note && !noteFocused ? (
            <Pressable style={styles.notePreview} onPress={() => setNoteFocused(true)}>
              <Icon name="edit" size={12} color="rgba(255,255,255,0.85)" />
              <Text numberOfLines={1} style={styles.notePreviewText}>{note}</Text>
            </Pressable>
          ) : null}

        </View>
      </View>

      {/* Capture area — minus the "vuốt lên" hint */}
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
        <View style={styles.chevron}>
          <Icon name="arrow-up" size={14} color="rgba(255,255,255,0.42)" />
        </View>
      </View>
      {noteFocused && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.noteInputOverlay}
        >
          <Pressable style={styles.noteBackdrop} onPress={() => setNoteFocused(false)} />
          <View style={styles.noteCard}>
            <Text style={styles.noteCardLabel}>Ghi chú</Text>
            <TextInput
              autoFocus
              value={note}
              onChangeText={setNote}
              onBlur={() => setNoteFocused(false)}
              placeholder="VD: Cà phê Highlands"
              placeholderTextColor="rgba(255,255,255,0.4)"
              returnKeyType="done"
              onSubmitEditing={() => setNoteFocused(false)}
              maxLength={140}
              style={styles.noteCardInput}
            />
            <Text style={styles.noteCardHint}>Nhấn Done hoặc bên ngoài để đóng</Text>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

function EmptyTodayCard() {
  const colors = useColors();
  return (
    <View
      style={{
        height: SCREEN_HEIGHT,
        backgroundColor: colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}>
      <TodayBadge />
      <Text style={{ fontSize: 48, marginBottom: 12 }}>✨</Text>
      <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text, textAlign: 'center' }}>
        Chưa có giao dịch nào hôm nay
      </Text>
      <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 6, textAlign: 'center' }}>
        Chụp bill đầu tiên nhé!
      </Text>
    </View>
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
  noteTapZone: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    height: '50%', zIndex: 5,
  },
  notePreview: {
    position: 'absolute', bottom: 14, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
    backgroundColor: 'rgba(18,18,18,0.55)',
    maxWidth: '80%', zIndex: 6,
  },
  notePreviewText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  noteInputOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
    zIndex: 30,
  },
  noteBackdrop: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  noteCard: {
    width: '85%',
    padding: 20, borderRadius: 20,
    backgroundColor: '#1D1D1D',
    gap: 8,
  },
  noteCardLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12, fontWeight: '700', letterSpacing: 0.5,
  },
  noteCardInput: {
    fontSize: 18, fontWeight: '600', color: '#fff',
    padding: 12, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    minHeight: 48,
  },
  noteCardHint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11, fontWeight: '500',
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
  chevron: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backToCamera: {
    position: 'absolute',
    alignSelf: 'center',
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 20,
  },
});
