import { StyleSheet, Text as RNText, TextInput as RNTextInput } from 'react-native';
import type { TextInputProps, TextProps, TextStyle } from 'react-native';

import { fontFamilyForWeight } from '@/constants/tokens';

/**
 * Text / TextInput that render in Plus Jakarta Sans. Each weight is a separate
 * font family, so we read the style's fontWeight and pick the matching family,
 * then neutralise fontWeight to avoid synthetic (faux) bolding on top of it.
 */
export function Text({ style, ...rest }: TextProps) {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const fontFamily = fontFamilyForWeight(flat?.fontWeight);
  return <RNText style={[style, { fontFamily, fontWeight: 'normal' }]} {...rest} />;
}

export function TextInput({ style, ...rest }: TextInputProps) {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const fontFamily = fontFamilyForWeight(flat?.fontWeight);
  return <RNTextInput style={[style, { fontFamily, fontWeight: 'normal' }]} {...rest} />;
}
