import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { Text } from './text';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { AccentGradient, Radius, W } from '@/constants/tokens';

/** Fills its parent with a diagonal (135°) gradient using react-native-svg. */
export function GradientFill({
  colors = AccentGradient,
  style,
}: {
  colors?: readonly [string, string];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors[0]} />
            <Stop offset="1" stopColor={colors[1]} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#grad)" />
      </Svg>
    </View>
  );
}

export function GradientButton({
  label,
  onPress,
  colors = AccentGradient,
  style,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  colors?: readonly [string, string];
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [{ opacity: pressed || disabled ? 0.92 : 1 }, style]}>
      <View style={styles.button}>
        <GradientFill colors={colors} />
        <Text style={styles.buttonLabel}>{label}</Text>
      </View>
    </Pressable>
  );
}

/** Locket-style shutter button. */
export function Shutter({ onPress, size = 74, gradientRing = false }: { onPress?: () => void; size?: number; gradientRing?: boolean }) {
  const inner = size - 16;
  return (
    <Pressable onPress={onPress} hitSlop={16} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      {gradientRing ? (
        <View style={{ width: size, height: size, borderRadius: size / 2, padding: 5, overflow: 'hidden' }}>
          <GradientFill />
          <View style={{ flex: 1, borderRadius: size / 2, backgroundColor: '#fff' }} />
        </View>
      ) : (
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 5,
            borderColor: 'rgba(255,255,255,0.92)',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <View style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: '#fff' }} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: Radius.button,
    overflow: 'hidden',
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF6B6B',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: W.extrabold,
  },
});
