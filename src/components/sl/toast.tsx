import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/sl/text';
import { AccentGradient, W } from '@/constants/tokens';

// Camera capture row (shutter + swipe-up chevron) occupies roughly
// insets.bottom + 24…128, so the toast must clear it to avoid covering
// the chevron/shutter and swallowing taps for the toast's full duration.
const TOAST_BOTTOM_OFFSET = 140;

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
    try {
      AccessibilityInfo.announceForAccessibility(message);
    } catch {
      // best-effort: VoiceOver announcement should never break the toast
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opacity]);

  return (
    <Animated.View
      testID="toast-wrap"
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: insets.bottom + TOAST_BOTTOM_OFFSET, opacity }]}>
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
