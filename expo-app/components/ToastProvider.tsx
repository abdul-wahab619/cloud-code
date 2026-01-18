import React, { createContext, useCallback, useState, useMemo, ReactNode } from 'react';
import { View, StyleSheet, Platform, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Toast, type ToastType, type ToastProps } from './Toast';
import type { ToastContextValue, ToastOptions } from '../lib/useToast';

interface ToastItem extends ToastProps {
  createdAt: number;
}

interface ToastProviderProps {
  children: ReactNode;
  maxVisible?: number;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

const generateId = () => `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const DEFAULT_DURATIONS: Record<ToastType, number> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000,
};

/**
 * Provider component that enables toast notifications throughout the app.
 * Must be rendered at the root of your application.
 *
 * @example
 * ```tsx
 * import { ToastProvider } from './components/ToastProvider';
 *
 * export default function RootLayout() {
 *   return (
 *     <ToastProvider>
 *       <YourAppContent />
 *     </ToastProvider>
 *   );
 * }
 * ```
 */
export function ToastProvider({
  children,
  maxVisible = 3,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType, options?: ToastOptions): string => {
      const id = generateId();

      setToasts((prev) => {
        const newToast: ToastItem = {
          id,
          message,
          type,
          duration: options?.duration ?? DEFAULT_DURATIONS[type],
          onDismiss: dismiss,
          createdAt: Date.now(),
        };

        // Limit number of visible toasts
        const updated = [...prev, newToast];
        if (updated.length > maxVisible) {
          // Remove oldest toast
          updated.shift();
        }

        return updated;
      });

      return id;
    },
    [dismiss, maxVisible]
  );

  const toast = useCallback(
    (message: string, options?: ToastOptions & { type?: ToastType }): string => {
      return showToast(message, options?.type ?? 'info', options);
    },
    [showToast]
  );

  const success = useCallback(
    (message: string, options?: ToastOptions): string => {
      return showToast(message, 'success', options);
    },
    [showToast]
  );

  const error = useCallback(
    (message: string, options?: ToastOptions): string => {
      return showToast(message, 'error', options);
    },
    [showToast]
  );

  const warning = useCallback(
    (message: string, options?: ToastOptions): string => {
      return showToast(message, 'warning', options);
    },
    [showToast]
  );

  const info = useCallback(
    (message: string, options?: ToastOptions): string => {
      return showToast(message, 'info', options);
    },
    [showToast]
  );

  const contextValue = useMemo<ToastContextValue>(
    () => ({
      toast,
      success,
      error,
      warning,
      info,
      dismiss,
      dismissAll,
    }),
    [toast, success, error, warning, info, dismiss, dismissAll]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
}

interface ToastContainerProps {
  toasts: ToastItem[];
}

function ToastContainer({ toasts }: ToastContainerProps) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <SafeAreaView style={StyleSheet.absoluteFill} edges={['top']}>
      <View style={styles.container} pointerEvents="box-none">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            id={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onDismiss={toast.onDismiss}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingTop: Platform.OS === 'ios' ? 8 : 16,
    alignItems: 'center',
    pointerEvents: 'none',
  } as ViewStyle,
});
