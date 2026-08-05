const { getDefaultConfig } = require('expo/metro-config');
const { withNativewind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Exclude test files from the bundle. Otherwise expo-router's
// require.context on `src/app/` would pull in colocated `.test.tsx` files
// and their `@testing-library/react-native` deps (which import Node's
// `console`, breaking the RN bundle).
config.resolver.blockList = /(.*\.test\.(js|jsx|ts|tsx)|.*\.spec\.(js|jsx|ts|tsx)|.*\/__tests__\/.*)$/;

module.exports = withNativewind(config, {
  // inline variables break PlatformColor in CSS variables
  inlineVariables: false,
  // We add className support manually
  globalClassNamePolyfill: false,
});
