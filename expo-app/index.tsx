// Expo Router entry point for native platforms
import 'global';

// expo-router/entry is untyped - use require for untyped import
const registerRootComponent = require('expo-router/entry').registerRootComponent as () => void;

import { LogBox } from 'react-native';

// Log any remaining warnings for debugging
// Note: LogBox doesn't have addEventListener, using console.warn instead
if (__DEV__) {
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    originalWarn('[ReactNative Warning]', ...args);
  };
}

// Wrap registration in error handler
try {
  registerRootComponent();
} catch (error) {
  console.error('[AppInit] Failed to register root component:', error);

  // In development, let the error surface for debugging
  if (__DEV__) {
    throw error;
  }
  // In production, the error is logged but the app may show a blank screen
  // Consider adding a proper error boundary at the app root level
}
