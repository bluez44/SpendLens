import { Pressable, StyleSheet } from 'react-native';

import { Text } from './text';

import { CategoryIcon } from '@/components/expense/category-icon';
import type { Category } from '@/lib/categories';
import { Radius, useColors, W } from '@/constants/tokens';

export function CategoryChip({
  category,
  selected,
  onPress,
}: {
  category: Category;
  selected: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? category.chip : c.chipBg, borderColor: selected ? category.fg : 'transparent' },
      ]}>
      <CategoryIcon category={category.id} color={selected ? category.fg : c.chipText} size={15} />
      <Text style={{ fontSize: 13, fontWeight: selected ? W.bold : W.semibold, color: selected ? category.fg : c.chipText }}>
        {category.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: Radius.chip,
    borderWidth: 2,
  },
});
