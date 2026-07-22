import { Image } from 'expo-image';
import { View } from 'react-native';
import type { DimensionValue } from 'react-native';

import { GradientFill } from './gradient';

/** Photo thumbnail with a warm gradient fallback when there's no image. */
export function PhotoTile({
  uri,
  size,
  width,
  height,
  radius = 16,
}: {
  uri?: string | null;
  size?: number;
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
}) {
  const w = width ?? size;
  const h = height ?? size;
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: w, height: h, borderRadius: radius }}
        contentFit="cover"
        transition={150}
      />
    );
  }
  return (
    <View style={{ width: w, height: h, borderRadius: radius, overflow: 'hidden' }}>
      <GradientFill colors={['#e89b52', '#9c4a20'] as const} />
    </View>
  );
}
