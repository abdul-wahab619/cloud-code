import { useContext } from 'react';
import { ToastContext } from '../components/ToastProvider';
import type { ToastType } from '../components/Toast';

export interface ToastOptions {
  duration?: number;
}

export interface ToastContextValue {
  toast: (message: string, options?: ToastOptions) => string;
  success: (message: string, options?: ToastOptions) => string;
  error: (message: string, options?: ToastOptions) => string;
  warning: (message: string, options?: ToastOptions) => string;
  info: (message: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

/**
 * Hook to access toast functionality from anywhere in the app.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { success, error } = useToast();
 *
 *   const handleAction = async () => {
 *     try {
 *       await doSomething();
 *       success('Action completed successfully!');
 *     } catch {
 *       error('Something went wrong');
 *     }
 *   };
 *
 *   return <Button onPress={handleAction}>Do Something</Button>;
 * }
 * ```
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }

  return context;
}
