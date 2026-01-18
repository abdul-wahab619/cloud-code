/**
 * Authentication Modal Component
 *
 * Provides login and registration functionality for user accounts.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../lib/useStore';
import type { LoginCredentials, RegisterCredentials } from '../lib/types';

// ============================================================================
// Types
// ============================================================================

export type AuthMode = 'login' | 'register';

interface AuthModalProps {
  visible: boolean;
  mode: AuthMode;
  onClose: () => void;
  onModeChange?: (mode: AuthMode) => void;
  onSuccess?: () => void;
}

// ============================================================================
// Main Component
// ============================================================================

export function AuthModal({ visible, mode, onClose, onModeChange, onSuccess }: AuthModalProps) {
  const { login, register, isAuthenticating } = useAppStore();

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form state
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');

  // Validation errors
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleLogin = async () => {
    // Reset errors
    setEmailError('');
    setPasswordError('');

    // Validate
    let isValid = true;

    if (!loginEmail.trim()) {
      setEmailError('Email is required');
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail)) {
      setEmailError('Invalid email address');
      isValid = false;
    }

    if (!loginPassword) {
      setPasswordError('Password is required');
      isValid = false;
    }

    if (!isValid) return;

    const credentials: LoginCredentials = {
      email: loginEmail.trim(),
      password: loginPassword,
    };

    const result = await login(credentials);

    if (result.success) {
      setLoginEmail('');
      setLoginPassword('');
      onSuccess?.();
      onClose();
    } else {
      Alert.alert('Login Failed', result.error || 'Please check your credentials and try again.');
    }
  };

  const handleRegister = async () => {
    // Reset errors
    setEmailError('');
    setPasswordError('');

    // Validate
    let isValid = true;

    if (!registerName.trim()) {
      Alert.alert('Validation Error', 'Name is required');
      isValid = false;
    }

    if (!registerEmail.trim()) {
      setEmailError('Email is required');
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerEmail)) {
      setEmailError('Invalid email address');
      isValid = false;
    }

    if (!registerPassword) {
      setPasswordError('Password is required');
      isValid = false;
    } else if (registerPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      isValid = false;
    } else if (registerPassword !== registerConfirmPassword) {
      setPasswordError('Passwords do not match');
      isValid = false;
    }

    if (!isValid) return;

    const credentials: RegisterCredentials = {
      name: registerName.trim(),
      email: registerEmail.trim(),
      password: registerPassword,
    };

    const result = await register(credentials);

    if (result.success) {
      setRegisterName('');
      setRegisterEmail('');
      setRegisterPassword('');
      setRegisterConfirmPassword('');
      onSuccess?.();
      onClose();
    } else {
      Alert.alert('Registration Failed', result.error || 'Please try again later.');
    }
  };

  const handleClose = () => {
    // Reset form state
    setLoginEmail('');
    setLoginPassword('');
    setRegisterName('');
    setRegisterEmail('');
    setRegisterPassword('');
    setRegisterConfirmPassword('');
    setEmailError('');
    setPasswordError('');
    onClose();
  };

  const switchToMode = (newMode: AuthMode) => {
    // Reset errors when switching modes
    setEmailError('');
    setPasswordError('');
    onModeChange?.(newMode);
  };

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardContainer}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={24} color="#AEAEB2" />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {mode === 'login' ? (
              <>
                {/* Login Form */}
                <View style={styles.form}>
                  <Text style={styles.subtitle}>
                    Sign in to track your usage and access premium features
                  </Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                      style={[styles.input, emailError && styles.inputError]}
                      placeholder="your@email.com"
                      placeholderTextColor="#8E8E93"
                      value={loginEmail}
                      onChangeText={setLoginEmail}
                      autoCapitalize="none"
                      autoComplete="email"
                      textContentType="emailAddress"
                      keyboardType="email-address"
                      editable={!isAuthenticating}
                      accessibilityLabel="Email address"
                    />
                    {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Password</Text>
                    <TextInput
                      style={[styles.input, passwordError && styles.inputError]}
                      placeholder="••••••••"
                      placeholderTextColor="#8E8E93"
                      value={loginPassword}
                      onChangeText={setLoginPassword}
                      secureTextEntry
                      autoComplete="password"
                      textContentType="password"
                      editable={!isAuthenticating}
                      accessibilityLabel="Password"
                    />
                    {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
                  </View>

                  <TouchableOpacity
                    style={[styles.submitButton, isAuthenticating && styles.submitButtonDisabled]}
                    onPress={handleLogin}
                    disabled={isAuthenticating}
                    accessibilityRole="button"
                    accessibilityLabel="Sign in"
                    accessibilityState={{ disabled: isAuthenticating }}
                  >
                    {isAuthenticating ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.submitButtonText}>Sign In</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Switch to Register */}
                <View style={styles.switchContainer}>
                  <Text style={styles.switchText}>Don't have an account? </Text>
                  <TouchableOpacity onPress={() => switchToMode('register')}>
                    <Text style={styles.switchLink}>Create one</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                {/* Register Form */}
                <View style={styles.form}>
                  <Text style={styles.subtitle}>
                    Create a free account to get started with 10 sessions per month
                  </Text>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Name</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Your name"
                      placeholderTextColor="#8E8E93"
                      value={registerName}
                      onChangeText={setRegisterName}
                      autoCapitalize="words"
                      autoComplete="name"
                      textContentType="name"
                      editable={!isAuthenticating}
                      accessibilityLabel="Full name"
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Email</Text>
                    <TextInput
                      style={[styles.input, emailError && styles.inputError]}
                      placeholder="your@email.com"
                      placeholderTextColor="#8E8E93"
                      value={registerEmail}
                      onChangeText={setRegisterEmail}
                      autoCapitalize="none"
                      autoComplete="email"
                      textContentType="emailAddress"
                      keyboardType="email-address"
                      editable={!isAuthenticating}
                      accessibilityLabel="Email address"
                    />
                    {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Password</Text>
                    <TextInput
                      style={[styles.input, passwordError && styles.inputError]}
                      placeholder="••••••••"
                      placeholderTextColor="#8E8E93"
                      value={registerPassword}
                      onChangeText={setRegisterPassword}
                      secureTextEntry
                      autoComplete="password"
                      textContentType="newPassword"
                      editable={!isAuthenticating}
                      accessibilityLabel="Password"
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Confirm Password</Text>
                    <TextInput
                      style={[styles.input, passwordError && styles.inputError]}
                      placeholder="••••••••"
                      placeholderTextColor="#8E8E93"
                      value={registerConfirmPassword}
                      onChangeText={setRegisterConfirmPassword}
                      secureTextEntry
                      autoComplete="password"
                      textContentType="newPassword"
                      editable={!isAuthenticating}
                      accessibilityLabel="Confirm password"
                    />
                    {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
                  </View>

                  <TouchableOpacity
                    style={[styles.submitButton, isAuthenticating && styles.submitButtonDisabled]}
                    onPress={handleRegister}
                    disabled={isAuthenticating}
                    accessibilityRole="button"
                    accessibilityLabel="Create account"
                    accessibilityState={{ disabled: isAuthenticating }}
                  >
                    {isAuthenticating ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.submitButtonText}>Create Account</Text>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Switch to Login */}
                <View style={styles.switchContainer}>
                  <Text style={styles.switchText}>Already have an account? </Text>
                  <TouchableOpacity onPress={() => switchToMode('login')}>
                    <Text style={styles.switchLink}>Sign in</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  keyboardContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    maxWidth: 400,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    overflow: 'hidden',
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#38383A',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  form: {
    gap: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#AEAEB2',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#AEAEB2',
    marginLeft: 4,
  },
  input: {
    backgroundColor: '#2C2C2E',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#38383A',
  },
  inputError: {
    borderColor: '#FF3B30',
  },
  errorText: {
    fontSize: 12,
    color: '#FF3B30',
    marginLeft: 4,
  },
  submitButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  switchText: {
    fontSize: 14,
    color: '#AEAEB2',
  },
  switchLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
});
