import { StyleSheet, View } from 'react-native';

import { GradientFill } from '@/components/sl/gradient';
import { Text } from '@/components/sl/text';
import { W } from '@/constants/tokens';
import { useT } from '@/lib/i18n';
import type { StreakData } from '@/lib/share-cards';

const CARD_W = 360;
const CARD_H = 640;

export interface StreakCardProps {
  data: StreakData;
}

export function StreakCard({ data }: StreakCardProps) {
  const { t } = useT();
  const { logDays, txnCountThisWeek, hype } = data;

  return (
    <View style={styles.card}>
      <GradientFill />

      <Text style={styles.watermark}>{t('share.watermark')}</Text>

      <View style={styles.body}>
        <Text style={styles.emoji}>🔥</Text>
        <Text style={styles.number}>{logDays}</Text>
        <Text style={styles.label}>{t('share.streak_days_label')}</Text>
        <Text style={styles.hype}>{t(`hype.${hype}`)}</Text>
        <Text style={styles.microStat}>{t('share.streak_micro_stat', { n: txnCountThisWeek })}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_H,
    overflow: 'hidden',
    position: 'relative',
  },
  watermark: {
    position: 'absolute',
    top: 16,
    left: 20,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: W.semibold,
    letterSpacing: 1,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  emoji: {
    fontSize: 100,
    lineHeight: 108,
  },
  number: {
    fontSize: 96,
    color: '#fff',
    fontWeight: W.extrabold,
    letterSpacing: -2,
    marginTop: 8,
  },
  label: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: W.semibold,
    textAlign: 'center',
    marginTop: 8,
  },
  hype: {
    fontSize: 20,
    color: '#fff',
    fontWeight: W.bold,
    marginTop: 40,
  },
  microStat: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: W.medium,
    marginTop: 40,
  },
});
