import React, { Component, ReactNode } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../lib/styles';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * ErrorBoundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI.
 *
 * Features:
 * - componentDidCatch lifecycle for logging errors
 * - getDerivedStateFromError for error state
 * - User-friendly fallback UI with "Try Again" button
 * - Error reporting to console (prepare for Sentry integration)
 * - Reset mechanism to recover from errors
 * - Collapsible technical details section
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  /**
   * static getDerivedStateFromError
   * Updates state when an error is thrown
   */
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  /**
   * componentDidCatch
   * Logs error details and calls optional onError callback
   * This is where Sentry integration would be added
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log to console for development
    console.error('ErrorBoundary caught an error:', error);
    console.error('Error Info:', errorInfo);

    // Log component stack for debugging
    console.error('Component Stack:', errorInfo.componentStack);

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Update state with error info
    this.setState({
      errorInfo,
    });

    // TODO: Send to Sentry when integrated
    // Sentry.captureException(error, {
    //   contexts: {
    //     react: {
    //       componentStack: errorInfo.componentStack,
    //     },
    //   },
    // });
  }

  /**
   * Resets the error boundary state
   * Call this to retry the operation that failed
   */
  resetErrorBoundary = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return <ErrorFallback error={this.state.error} errorInfo={this.state.errorInfo} onReset={this.resetErrorBoundary} />;
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  onReset: () => void;
}

function ErrorFallback({ error, errorInfo, onReset }: ErrorFallbackProps) {
  const [showDetails, setShowDetails] = React.useState(false);

  const handleGoHome = () => {
    // Navigate to root tab
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Error Icon */}
        <View style={styles.iconContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={colors.error} />
        </View>

        {/* Error Message */}
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>
          An unexpected error occurred. You can try again or return to the home screen.
        </Text>

        {/* Action Buttons */}
        <View style={styles.buttonContainer}>
          <Pressable
            onPress={onReset}
            style={({ pressed }) => [styles.button, styles.primaryButton, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Ionicons name="refresh-outline" size={20} color={colors.background} style={styles.buttonIcon} />
            <Text style={styles.primaryButtonText}>Try Again</Text>
          </Pressable>

          <Pressable
            onPress={handleGoHome}
            style={({ pressed }) => [styles.button, styles.secondaryButton, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Ionicons name="home-outline" size={20} color={colors.foreground} style={styles.buttonIcon} />
            <Text style={styles.secondaryButtonText}>Go Home</Text>
          </Pressable>
        </View>

        {/* Technical Details Toggle */}
        <Pressable
          onPress={() => setShowDetails(!showDetails)}
          style={({ pressed }) => [styles.detailsToggle, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Ionicons
            name={showDetails ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.mutedForeground}
          />
          <Text style={styles.detailsToggleText}>
            {showDetails ? 'Hide' : 'Show'} Technical Details
          </Text>
        </Pressable>

        {/* Collapsible Technical Details */}
        {showDetails && (
          <View style={styles.detailsContainer}>
            <Text style={styles.detailsLabel}>Error Message:</Text>
            <Text style={styles.detailsText}>{error?.message || 'Unknown error'}</Text>

            {error?.stack && (
              <>
                <Text style={styles.detailsLabel}>Stack Trace:</Text>
                <Text style={styles.detailsText} selectable>
                  {error.stack}
                </Text>
              </>
            )}

            {errorInfo?.componentStack && (
              <>
                <Text style={styles.detailsLabel}>Component Stack:</Text>
                <ScrollView style={styles.componentStackScroll} nestedScrollEnabled>
                  <Text style={styles.detailsText} selectable>
                    {errorInfo.componentStack}
                  </Text>
                </ScrollView>
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 24,
    alignItems: 'center',
    paddingBottom: 48,
  },
  iconContainer: {
    marginTop: 60,
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 16,
    lineHeight: 24,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
    marginBottom: 32,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 24,
  },
  buttonIcon: {
    marginRight: 8,
  },
  primaryButton: {
    backgroundColor: colors.brand,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.background,
  },
  secondaryButton: {
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.foreground,
  },
  detailsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.muted,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailsToggleText: {
    fontSize: 14,
    color: colors.mutedForeground,
    fontWeight: '500',
  },
  detailsContainer: {
    width: '100%',
    marginTop: 16,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  detailsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  detailsText: {
    fontSize: 13,
    color: colors.foreground,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  componentStackScroll: {
    maxHeight: 200,
  },
});

export default ErrorBoundary;
