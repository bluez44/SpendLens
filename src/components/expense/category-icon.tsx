import Svg, { Circle, Path } from 'react-native-svg';

import type { CategoryId } from '@/lib/categories';

interface CategoryIconProps {
  category: CategoryId;
  color: string;
  size: number;
}

export function CategoryIcon({ category, color, size }: CategoryIconProps) {
  const stroke = { stroke: color, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

  switch (category) {
    case 'food':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M6 3v4.5a2.5 2.5 0 0 0 5 0V3" {...stroke} />
          <Path d="M8.5 3v18" {...stroke} />
          <Path d="M17.5 3c-1.9 1.7-2.9 4.8-2.9 7.4 0 1.8 1.2 2.8 2.9 2.8z" {...stroke} />
          <Path d="M17.5 13.5V21" {...stroke} />
        </Svg>
      );
    case 'transport':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4.5 15.5h15" {...stroke} />
          <Path d="M6 15.5l1.7-5.1A2 2 0 0 1 9.6 9h4.8a2 2 0 0 1 1.9 1.4l1.7 5.1" {...stroke} />
          <Circle cx={8} cy={18.2} r={1.3} fill={color} stroke="none" />
          <Circle cx={16} cy={18.2} r={1.3} fill={color} stroke="none" />
        </Svg>
      );
    case 'shopping':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M6.5 8h11l-1.1 12h-8.8z" {...stroke} />
          <Path d="M9 8V6.5a3 3 0 0 1 6 0V8" {...stroke} />
        </Svg>
      );
    case 'bills':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M7 3h10v18l-2.5-1.7L12 21l-2.5-1.7L7 21z" {...stroke} />
          <Path d="M10 8.5h4" {...stroke} />
          <Path d="M10 12.5h4" {...stroke} />
        </Svg>
      );
    case 'health':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 20.5S5 16 5 10.6A4.1 4.1 0 0 1 12 7.7a4.1 4.1 0 0 1 7 2.9C19 16 12 20.5 12 20.5z" {...stroke} />
        </Svg>
      );
    case 'fun':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4.5 6.5h15v12h-15z" {...stroke} />
          <Path d="M4.5 10h15" {...stroke} />
          <Path d="M8.5 6.5V10" {...stroke} />
          <Path d="M12 6.5V10" {...stroke} />
          <Path d="M15.5 6.5V10" {...stroke} />
        </Svg>
      );
    default:
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx={6} cy={12} r={1.5} fill={color} stroke="none" />
          <Circle cx={12} cy={12} r={1.5} fill={color} stroke="none" />
          <Circle cx={18} cy={12} r={1.5} fill={color} stroke="none" />
        </Svg>
      );
  }
}
