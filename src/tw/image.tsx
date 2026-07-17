import { Image as ExpoImage } from 'expo-image';
import React from 'react';
import { StyleSheet } from 'react-native';
import { useCssElement } from 'react-native-css';

function CSSImage(props: React.ComponentProps<typeof ExpoImage>) {
  // expo-image has no native objectFit/objectPosition style props; react-native-css
  // remaps the web-style CSS properties here, so this glue stays loosely typed.
  const flattened: any = StyleSheet.flatten(props.style) ?? {};
  const { objectFit, objectPosition, ...style } = flattened;

  return (
    <ExpoImage
      contentFit={objectFit}
      contentPosition={objectPosition}
      {...props}
      source={typeof props.source === 'string' ? { uri: props.source } : props.source}
      style={style}
    />
  );
}

export const Image = (props: React.ComponentProps<typeof CSSImage> & { className?: string }) => {
  return useCssElement(CSSImage, props, { className: 'style' });
};

Image.displayName = 'CSS(Image)';
