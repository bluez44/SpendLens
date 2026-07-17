import { Link as RouterLink } from 'expo-router';
import type React from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableHighlight,
  View,
} from 'react-native-css/components';
import { useCssElement, useNativeVariable } from 'react-native-css';

export { Pressable, ScrollView, Text, TextInput, TouchableHighlight, View };

export const useCSSVariable =
  process.env.EXPO_OS !== 'web' ? useNativeVariable : (variable: string) => `var(${variable})`;

export const Link = (props: React.ComponentProps<typeof RouterLink> & { className?: string }) => {
  return useCssElement(RouterLink as unknown as React.ComponentType<Record<string, unknown>>, props, {
    className: 'style',
  });
};

Link.Trigger = RouterLink.Trigger;
Link.Menu = RouterLink.Menu;
Link.MenuAction = RouterLink.MenuAction;
Link.Preview = RouterLink.Preview;
