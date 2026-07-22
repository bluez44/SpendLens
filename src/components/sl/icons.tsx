import Svg, { Circle, Path } from 'react-native-svg';

export type IconName =
  | 'home'
  | 'menu'
  | 'back'
  | 'grid'
  | 'close'
  | 'edit'
  | 'plus'
  | 'arrow-up'
  | 'flip'
  | 'flash'
  | 'flash-off'
  | 'settings';

export function Icon({
  name,
  size = 21,
  color = '#fff',
  strokeWidth = 1.9,
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  const p = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'home' && (
        <>
          <Path d="M4 11.5 12 5l8 6.5" {...p} />
          <Path d="M6.2 10.3V19h11.6v-8.7" {...p} />
        </>
      )}
      {name === 'menu' && (
        <>
          <Path d="M8.5 7h11M8.5 12h11M8.5 17h11" {...p} />
          <Circle cx={4.6} cy={7} r={1.15} fill={color} stroke="none" />
          <Circle cx={4.6} cy={12} r={1.15} fill={color} stroke="none" />
          <Circle cx={4.6} cy={17} r={1.15} fill={color} stroke="none" />
        </>
      )}
      {name === 'back' && <Path d="M15 5l-7 7 7 7" {...p} strokeWidth={2} />}
      {name === 'grid' && (
        <>
          <Path d="M4 4h7v7H4z" {...p} />
          <Path d="M13 4h7v7h-7z" {...p} />
          <Path d="M4 13h7v7H4z" {...p} />
          <Path d="M13 13h7v7h-7z" {...p} />
        </>
      )}
      {name === 'close' && <Path d="M6 6l12 12M18 6 6 18" {...p} strokeWidth={2.2} />}
      {name === 'edit' && (
        <>
          <Path d="M4 20h4L18.5 9.5a2 2 0 0 0-2.8-2.8L5 17.2z" {...p} />
          <Path d="M14 6.5 17.5 10" {...p} />
        </>
      )}
      {name === 'plus' && <Path d="M12 5v14M5 12h14" {...p} strokeWidth={2.4} />}
      {name === 'arrow-up' && <Path d="M12 19V6M6 12l6-6 6 6" {...p} strokeWidth={2.2} />}
      {name === 'flip' && (
        <>
          <Path d="M4.5 9.5a8 8 0 0 1 13.7-2.7" {...p} />
          <Path d="M18.5 3.5V8H14" {...p} />
          <Path d="M19.5 14.5a8 8 0 0 1-13.7 2.7" {...p} />
          <Path d="M5.5 20.5V16H10" {...p} />
        </>
      )}
      {name === 'flash' && <Path d="M13 2 5 13h5l-1 9 8-12h-5z" {...p} />}
      {name === 'flash-off' && (
        <>
          <Path d="M13 2 5 13h5l-1 9 8-12h-5z" {...p} />
          <Path d="M4 3l16 18" {...p} strokeWidth={2.2} />
        </>
      )}
      {name === 'settings' && (
        <>
          <Path d="M4 7h10M4 12h6M4 17h13" {...p} strokeWidth={2} />
          <Circle cx={17} cy={7} r={2.2} {...p} strokeWidth={2} />
          <Circle cx={13} cy={12} r={2.2} {...p} strokeWidth={2} />
          <Circle cx={20} cy={17} r={2.2} {...p} strokeWidth={2} />
        </>
      )}
    </Svg>
  );
}
