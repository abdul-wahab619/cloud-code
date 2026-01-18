/**
 * Biometric Authentication Module
 * Handles Face ID, Touch ID, and other biometric authentication
 */

import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { haptics } from '../lib/haptics';

export type BiometricType =
  | 'face'
  | 'fingerprint'
  | 'iris'
  | 'none';

export interface BiometricConfig {
  allowDeviceCredentials?: boolean;
  promptMessage?: string;
  fallbackLabel?: string;
  cancelLabel?: string;
}

/**
 * Check if biometric authentication is available
 */
export async function isBiometricAvailable(): Promise<{
  available: boolean;
  biometricType: BiometricType;
}> {
  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) {
      return { available: false, biometricType: 'none' };
    }

    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      return { available: false, biometricType: 'none' };
    }

    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const biometricType = getBiometricType(types);

    return { available: true, biometricType };
  } catch (error) {
    console.error('Error checking biometric availability:', error);
    return { available: false, biometricType: 'none' };
  }
}

/**
 * Get the type of biometric authentication
 */
function getBiometricType(types: LocalAuthentication.AuthenticationType[]): BiometricType {
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return 'face';
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return 'fingerprint';
  }
  // Check for iris recognition (platform-specific, may not exist)
  const irisType = 4; // IRIS_RECOGNITION constant value
  if (types.includes(irisType as LocalAuthentication.AuthenticationType)) {
    return 'iris';
  }
  return 'none';
}

/**
 * Get the display name for biometric type
 */
export function getBiometricTypeName(type: BiometricType): string {
  switch (type) {
    case 'face':
      return 'Face ID';
    case 'fingerprint':
      return 'Touch ID';
    case 'iris':
      return 'Iris';
    default:
      return 'Biometric';
  }
}

/**
 * Authenticate with biometrics
 */
export async function authenticate(config: BiometricConfig = {}): Promise<{
  success: boolean;
  error?: string;
}> {
  const {
    promptMessage = 'Authenticate to continue',
    fallbackLabel = 'Use Passcode',
    cancelLabel = 'Cancel',
    allowDeviceCredentials = true,
  } = config;

  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel,
      cancelLabel,
      disableDeviceFallback: !allowDeviceCredentials,
    });

    if (result.success) {
      haptics.success();
    }

    return { success: result.success };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    haptics.error();
    return { success: false, error: errorMessage };
  }
}

/**
 * Get user-friendly error message
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    switch (error.name) {
      case 'ERR_NOT_ENROLLED':
        return 'No biometric data enrolled. Please set up Face ID or Touch ID in your device settings.';
      case 'ERR_LOCKOUT':
        return 'Too many attempts. Please try again later.';
      case 'ERR_PASSCODE_NOT_SET':
        return 'Please set up a passcode in your device settings.';
      case 'ERR_USER_CANCEL':
        return 'Authentication was cancelled.';
      case 'ERR_SYSTEM_CANCEL':
        return 'Authentication was cancelled.';
      case 'ERR_NOT_SUPPORTED':
        return 'Biometric authentication is not supported on this device.';
      default:
        return error.message;
    }
  }
  return 'Authentication failed';
}

/**
 * Lock the app with biometric authentication
 * Returns a function to unlock
 */
export async function lockApp(config?: BiometricConfig): Promise<() => Promise<boolean>> {
  const { available } = await isBiometricAvailable();

  if (!available) {
    // No biometric available, return a no-op unlock function
    return async () => true;
  }

  // Perform initial authentication
  const authResult = await authenticate(config);
  if (!authResult.success) {
    throw new Error(authResult.error || 'Authentication failed');
  }

  // Return unlock function
  return async () => {
    const result = await authenticate(config);
    return result.success;
  };
}

/**
 * Hook for biometric authentication
 */
export function useBiometrics(config?: BiometricConfig) {
  const [isAvailable, setIsAvailable] = React.useState(false);
  const [biometricType, setBiometricType] = React.useState<BiometricType>('none');
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    isBiometricAvailable().then(({ available, biometricType }) => {
      setIsAvailable(available);
      setBiometricType(biometricType);
    });
  }, []);

  const authenticateUser = async () => {
    setIsLoading(true);
    try {
      const result = await authenticate(config);
      setIsLoading(false);
      return result;
    } catch (error) {
      setIsLoading(false);
      return { success: false, error: 'Authentication failed' };
    }
  };

  return {
    isAvailable,
    biometricType,
    biometricTypeName: getBiometricTypeName(biometricType),
    isLoading,
    authenticate: authenticateUser,
  };
}

/**
 * Quick authentication for sensitive operations
 */
export async function quickAuthenticate(
  reason: string = 'Authenticate to continue'
): Promise<boolean> {
  const { available } = await isBiometricAvailable();

  if (!available) {
    return true; // No biometric available, skip auth
  }

  const result = await authenticate({ promptMessage: reason });
  return result.success;
}

import React from 'react';
