// Manual Jest mock for @gorhom/bottom-sheet.
// The real package pulls in react-native-reanimated and react-native-worklets
// which require native JSI modules unavailable in the Jest / Node environment.
// This stub exports the minimal shapes that date-range-sheet.tsx imports so
// pure-logic tests (e.g. activeQuick) can load the module without crashing.
import React from 'react';

export const BottomSheetModal = 'BottomSheetModal';
export const BottomSheetView = ({ children }: { children?: React.ReactNode }) => children;
export const BottomSheetBackdrop = () => null;
