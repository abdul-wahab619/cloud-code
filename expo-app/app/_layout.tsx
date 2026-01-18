import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View } from 'react-native';
import { ToastProvider } from '../components/ToastProvider';
import { AnalyticsProvider } from '../contexts/AnalyticsContext';
import { NotificationProvider, useNotificationResponseListener } from '../contexts/NotificationContext';
import * as Linking from 'expo-linking';

// Handle notification taps
function NotificationHandler({ children }: { children: React.ReactNode }) {
  useNotificationResponseListener((response) => {
    const url = response.notification.request.content.data?.url as string | undefined;

    if (url) {
      Linking.openURL(url);
    }
  });

  return <>{children}</>;
}

// Wrap with necessary providers for web
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AnalyticsProvider>
          <NotificationProvider>
            <NotificationHandler>
              <ToastProvider>
                <StatusBar style="light" />
                <View style={{ flex: 1, backgroundColor: '#09090b' }}>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: '#09090b' },
                    }}
                  >
                    <Stack.Screen name="(tabs)" />
                  </Stack>
                </View>
              </ToastProvider>
            </NotificationHandler>
          </NotificationProvider>
        </AnalyticsProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
// Cache bust 1767841569
// Force rebuild Wed Jan  7 22:08:43 EST 2026
