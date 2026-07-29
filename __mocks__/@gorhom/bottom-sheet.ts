// Manual Jest mock for @gorhom/bottom-sheet.
// The real package pulls in react-native-reanimated and react-native-worklets
// which require native JSI modules unavailable in the Jest / Node environment.
// This stub exports the minimal shapes that date-range-sheet.tsx (and other
// sl/*-sheet.tsx components) import so tests can load the module without
// crashing. BottomSheetModal exposes a working present()/dismiss() via
// useImperativeHandle so tests can drive sheets through their ref, the same
// way real screens do — it always renders its children (no hidden/visible
// gating), so content is queryable regardless of present()/dismiss() state.
import React, { forwardRef, useImperativeHandle } from 'react';
import { TextInput } from 'react-native';

export const BottomSheetModal = forwardRef<
  { present: (...args: unknown[]) => void; dismiss: () => void },
  { children?: React.ReactNode }
>(function BottomSheetModal({ children }, ref) {
  useImperativeHandle(ref, () => ({
    present: () => {},
    dismiss: () => {},
  }));
  return React.createElement(React.Fragment, null, children);
});
export const BottomSheetView = ({ children }: { children?: React.ReactNode }) => children;
export const BottomSheetBackdrop = () => null;
export const BottomSheetTextInput = forwardRef(
  (props: React.ComponentProps<typeof TextInput>, ref: React.ForwardedRef<TextInput>) => (
    React.createElement(TextInput, { ref, ...props } as any)
  ),
) as typeof TextInput;
