import { Pressable, StyleSheet, View } from 'react-native';

import { PhotoTile } from '@/components/sl/photo-tile';
import { Text } from '@/components/sl/text';
import { Radius, useColors, W } from '@/constants/tokens';
import { categoryOf } from '@/lib/categories';
import type { CurrencyCode } from '@/lib/currency';
import { formatMoney, signedMoney } from '@/lib/format';
import { convert, type RateMap } from '@/lib/fx';
import { useT } from '@/lib/i18n';
import type { Subscription } from '@/lib/subscriptions';

interface Props {
  subscription: Subscription;
  primary: CurrencyCode;
  rates: RateMap;
  onPress?: (sub: Subscription) => void;
}

export function SubscriptionRow({ subscription: sub, primary, rates, onPress }: Props) {
  const c = useColors();
  const { t } = useT();
  const cat = categoryOf(sub.category, []);
  const converted = convert(sub.originalAmount, sub.originalCurrency, primary, rates);

  return (
    <Pressable
      testID={`subscription-row-${sub.id}`}
      onPress={() => onPress?.(sub)}
      style={({ pressed }) => [
        styles.row,
        { opacity: pressed ? 0.7 : sub.paused ? 0.5 : 1 },
      ]}
    >
      <PhotoTile
        uri={sub.photoPath}
        size={56}
        radius={Radius.tile}
      />
      <View style={styles.middle}>
        <View style={styles.nameRow}>
          <Text style={{ color: c.text, fontWeight: W.semibold, fontSize: 15 }}>{sub.name}</Text>
          {sub.paused ? (
            <Text style={{ color: c.textSecondary, fontSize: 11, marginLeft: 8 }}>
              ⏸ {t('sub.paused_badge')}
            </Text>
          ) : null}
        </View>
        <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>
          {t('sub.day_row', { day: sub.anchorDay })}
        </Text>
      </View>
      <View style={styles.right}>
        <Text style={{ color: c.text, fontWeight: W.bold }}>
          {signedMoney(sub.originalAmount, sub.originalCurrency, false)}
        </Text>
        {sub.originalCurrency !== primary ? (
          <Text style={{ color: c.textSecondary, fontSize: 11, marginTop: 2 }}>
            ≈ {formatMoney(converted, primary)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  middle: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  right: { alignItems: 'flex-end' },
});
