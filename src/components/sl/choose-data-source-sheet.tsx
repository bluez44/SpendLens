import {
  BottomSheetBackdrop, BottomSheetModal, BottomSheetView,
} from '@gorhom/bottom-sheet';
import type { BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/sl/text';
import { Radius, useColors } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import type { MergeStrategy, Snapshot } from '@/lib/sync/types';

export interface ChooseDataSourceSheetHandle {
  present: (local: Snapshot, remote: Snapshot) => void;
  dismiss: () => void;
}

interface Props {
  onChoice: (strategy: MergeStrategy) => void;
}

export const ChooseDataSourceSheet = forwardRef<ChooseDataSourceSheetHandle, Props>(
  function ChooseDataSourceSheet({ onChoice }, ref) {
    const { t } = useT();
    const c = useColors();
    const sheet = useRef<BottomSheetModal>(null);
    const [pair, setPair] = useState<{ local: Snapshot; remote: Snapshot } | null>(null);

    useImperativeHandle(ref, () => ({
      present: (local, remote) => { setPair({ local, remote }); sheet.current?.present(); },
      dismiss: () => sheet.current?.dismiss(),
    }));

    const renderBackdrop = useCallback(
      (p: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} />
      ),
      [],
    );

    if (!pair) {
      return (
        <BottomSheetModal
          ref={sheet}
          snapPoints={['70%']}
          backdropComponent={renderBackdrop}
          backgroundStyle={{ backgroundColor: c.card }}
        >
          <BottomSheetView><Text>{''}</Text></BottomSheetView>
        </BottomSheetModal>
      );
    }

    const localCounts = t('sync.first_login.count_summary', {
      txns: pair.local.transactions.length, cats: pair.local.categories.length,
    });
    const cloudCounts = t('sync.first_login.count_summary', {
      txns: pair.remote.transactions.length, cats: pair.remote.categories.length,
    });
    const lastBackup = t('sync.first_login.last_backup', {
      when: new Date(pair.remote.generatedAt).toLocaleString(),
    });

    const choose = (s: MergeStrategy) => {
      onChoice(s);
      sheet.current?.dismiss();
    };

    return (
      <BottomSheetModal
        ref={sheet}
        snapPoints={['70%']}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: c.card }}
      >
        <BottomSheetView style={styles.body}>
          <Text style={{ fontWeight: '700', color: c.text, fontSize: 18 }}>
            {t('sync.first_login.title')}
          </Text>
          <Text style={{ color: c.textSecondary, marginTop: 4 }}>
            {t('sync.first_login.subtitle')}
          </Text>

          <Option
            testID="choose-source-local"
            title={t('sync.first_login.use_local')}
            desc={t('sync.first_login.use_local_desc')}
            meta={localCounts}
            colors={c}
            onPress={() => choose('local')}
          />
          <Option
            testID="choose-source-cloud"
            title={t('sync.first_login.use_cloud')}
            desc={t('sync.first_login.use_cloud_desc')}
            meta={`${cloudCounts}\n${lastBackup}`}
            colors={c}
            onPress={() => choose('cloud')}
          />
          <Option
            testID="choose-source-combine"
            title={t('sync.first_login.combine')}
            desc={t('sync.first_login.combine_desc')}
            meta=""
            colors={c}
            onPress={() => choose('combine')}
          />
        </BottomSheetView>
      </BottomSheetModal>
    );
  },
);

function Option({
  testID, title, desc, meta, colors, onPress,
}: {
  testID: string; title: string; desc: string; meta: string;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: colors.chipBg,
          borderColor: colors.cardBorder,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={{ fontWeight: '700', color: colors.text }}>{title}</Text>
      {meta ? <Text style={{ color: colors.textSecondary, marginTop: 2 }}>{meta}</Text> : null}
      <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 12 }}>{desc}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, gap: 12 },
  option: { padding: 16, borderRadius: Radius.card, borderWidth: StyleSheet.hairlineWidth },
});
