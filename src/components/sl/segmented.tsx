import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './text';

import { Radius, useColors, W } from '@/constants/tokens';

export function Segmented({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: number;
  onChange: (index: number) => void;
}) {
  const c = useColors();
  return (
    <View style={[styles.wrap, { backgroundColor: c.segment }]}>
      {options.map((label, i) => {
        const active = i === value;
        return (
          <Pressable
            key={label}
            onPress={() => onChange(i)}
            style={[styles.seg, active && { backgroundColor: c.segmentThumb, ...styles.thumbShadow }]}>
            <Text style={{ fontSize: 13, fontWeight: active ? W.bold : W.semibold, color: active ? c.text : c.textSecondary }}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    borderRadius: Radius.segment,
    padding: 4,
    gap: 2,
  },
  seg: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: Radius.segmentThumb,
  },
  thumbShadow: {
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
