import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/sl/text';
import { AccentGradient, W } from '@/constants/tokens';

export function Toast({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [opacity]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + 24, opacity }]}>
      <Animated.View style={styles.pill} accessibilityLiveRegion="polite">
        <Text numberOfLines={2} style={styles.message}>{message}</Text>
        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={actionLabel}>
            <Text style={styles.action}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 100,
    elevation: 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    maxWidth: 480,
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 22,
    backgroundColor: 'rgba(20,20,20,0.92)',
  },
  message: { flexShrink: 1, color: '#fff', fontSize: 14, fontWeight: W.semibold },
  action: { color: AccentGradient[1], fontSize: 14, fontWeight: W.extrabold },
});
