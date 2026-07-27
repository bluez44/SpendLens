import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/sl/text';
import { useColors, W } from '@/constants/tokens';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'biometric', '0', 'delete'] as const;

export interface PinPadProps {
  value: string;
  length: number;
  onDigit: (digit: string) => void;
  onDelete: () => void;
  onBiometricPress?: () => void;
  disabled?: boolean;
  error?: boolean;
}

export function PinPad({ value, length, onDigit, onDelete, onBiometricPress, disabled, error }: PinPadProps) {
  const c = useColors();

  return (
    <View style={styles.container}>
      <View style={styles.dots}>
        {Array.from({ length }).map((_, i) => (
          <View
            key={i}
            testID={`pin-dot-${i}`}
            style={[
              styles.dot,
              {
                backgroundColor: error ? '#FB5B4D' : c.text,
                opacity: i < value.length ? 1 : 0.2,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.grid}>
        {KEYS.map((key) => {
          if (key === 'biometric') {
            if (!onBiometricPress) return <View key={key} style={styles.key} />;
            return (
              <Pressable
                key={key}
                testID="pin-biometric"
                disabled={disabled}
                onPress={onBiometricPress}
                style={styles.key}>
                <Text style={{ color: c.text, fontSize: 20 }}>•••</Text>
              </Pressable>
            );
          }
          if (key === 'delete') {
            return (
              <Pressable key={key} testID="pin-delete" disabled={disabled} onPress={onDelete} style={styles.key}>
                <Text style={{ color: c.text, fontSize: 16, fontWeight: W.semibold }}>⌫</Text>
              </Pressable>
            );
          }
          return (
            <Pressable
              key={key}
              testID={`pin-digit-${key}`}
              disabled={disabled}
              onPress={() => onDigit(key)}
              style={styles.key}>
              <Text style={{ color: c.text, fontSize: 24, fontWeight: W.semibold }}>{key}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 28 },
  dots: { flexDirection: 'row', gap: 14 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 3 * 76, justifyContent: 'center' },
  key: { width: 76, height: 76, alignItems: 'center', justifyContent: 'center' },
});
