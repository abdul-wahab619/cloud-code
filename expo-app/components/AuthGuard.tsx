/**
 * Authentication Guard Component
 *
 * Protects child components from being accessed by unauthenticated users.
 * Shows a login modal when user is not authenticated.
 *
 * Usage:
 *   <AuthGuard requireAuth={true}>
 *     <ProtectedComponent />
 *   </AuthGuard>
 */

import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useAppStore } from '../lib/useStore';
import { AuthModal, AuthMode } from './AuthModal';

// ============================================================================
// Types
// ============================================================================

export interface AuthGuardProps {
  children: React.ReactNode;
  /** Whether authentication is required. If false, children are always shown. */
  requireAuth?: boolean;
  /** Optional custom message for why auth is required */
  message?: string;
  /** Whether to show a loading indicator while checking auth status */
  showLoading?: boolean;
  /** Callback when user successfully authenticates */
  onAuthSuccess?: () => void;
  /** Callback when auth check is complete */
  onAuthCheckComplete?: (isAuthenticated: boolean) => void;
}

// ============================================================================
// Component
// ============================================================================

export function AuthGuard({
  children,
  requireAuth = true,
  message,
  showLoading = true,
  onAuthSuccess,
  onAuthCheckComplete,
}: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAppStore();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  // Show auth modal if not authenticated and auth is required
  useEffect(() => {
    if (requireAuth && !isAuthenticated && !isLoading) {
      setShowAuthModal(true);
    }

    // Notify parent of auth check completion
    if (onAuthCheckComplete && !isLoading) {
      onAuthCheckComplete(isAuthenticated);
    }
  }, [requireAuth, isAuthenticated, isLoading, onAuthCheckComplete]);

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    onAuthSuccess?.();
  };

  const handleAuthModalClose = () => {
    // Don't allow closing if not authenticated - user must auth or leave
    if (isAuthenticated) {
      setShowAuthModal(false);
    }
  };

  // If auth is not required, always show children
  if (!requireAuth) {
    return <>{children}</>;
  }

  // Show loading while checking auth status
  if (isLoading && showLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // If authenticated, show children
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // Not authenticated - show auth modal
  return (
    <View style={styles.container}>
      {showLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" />
        </View>
      ) : null}

      <AuthModal
        visible={showAuthModal}
        mode={authMode}
        onClose={handleAuthModalClose}
        onModeChange={setAuthMode}
        onSuccess={handleAuthSuccess}
      />
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#09090b',
  },
});

// ============================================================================
// Higher-Order Component
// ============================================================================

/**
 * HOC to wrap a component with authentication protection
 *
 * @example
 *   const ProtectedScreen = withAuth(SettingsScreen);
 */
export function withAuth<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  requireAuth: boolean = true
): React.ComponentType<P> {
  return function WithAuthComponent(props: P) {
    return (
      <AuthGuard requireAuth={requireAuth}>
        <WrappedComponent {...props} />
      </AuthGuard>
    );
  };
}

// ============================================================================
// Hook for Conditional Auth
// ============================================================================

/**
 * Hook to check if a feature requires authentication based on user tier
 *
 * @param feature The feature to check
 * @returns Object with auth requirement info
 */
export function useAuthRequirement(feature: string): {
  requiresAuth: boolean;
  isAuthenticated: boolean;
  canAccess: boolean;
} {
  const { isAuthenticated, user } = useAppStore();

  // Define features that require auth
  const authRequiredFeatures = [
    'session_history',
    'session_replay',
    'analytics',
    'notifications',
    'offline_mode',
    'github_integration',
    'advanced_features',
  ];

  const requiresAuth = authRequiredFeatures.includes(feature);
  const canAccess = !requiresAuth || isAuthenticated;

  return {
    requiresAuth,
    isAuthenticated,
    canAccess,
  };
}

export default AuthGuard;
