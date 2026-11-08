import React, { useEffect } from 'react';
import { Linking } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '../src/providers/ThemeProvider';
import { TaskProvider } from '../src/providers/TaskProvider';
import { MoodProvider } from '../src/providers/MoodProvider';
import { ChatProvider } from '../src/providers/ChatProvider';
import { useChat } from '../src/hooks/useChat';
import { ErrorBoundary } from '../src/components/common/ErrorBoundary';
import { configureNotificationHandler } from '../src/services/checkinScheduler';
import { setupReconciliationManager } from '../src/services/reconciliationManager';
import { handleCheckinNotificationResponse } from '../src/services/notificationResponseHandler';
import { getDatabase } from '../src/db/client';
import { handleWidgetDeepLink } from '../src/services/widgets/widgetDeepLink';

configureNotificationHandler();

function RootNavigationLayout() {
  const { theme } = useTheme();
  const router = useRouter();
  const { selectConversation } = useChat();

  useEffect(() => {
    // 1. Set up all 6 lifecycle reconciliation triggers (cold launch, resume, preferences, permissions, timezone, midnight)
    const cleanupReconciliation = setupReconciliationManager();

    // 2. Check for cold-start notification response tap
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleCheckinNotificationResponse(response).then((result) => {
          if (result.handled && result.conversation) {
            selectConversation(result.conversation.id);
            router.push('/(tabs)/chat' as any);
          }
        });
      }
    });

    // 3. Foreground / background notification tap listener
    const notifSub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleCheckinNotificationResponse(response).then((result) => {
        if (result.handled && result.conversation) {
          selectConversation(result.conversation.id);
          router.push('/(tabs)/chat' as any);
        }
      });
    });

    // 4. Widget deep-link handler (cold start + warm start)
    const processDeepLink = async (url: string | null | undefined) => {
      if (!url) return;
      try {
        if (url.startsWith('cura://widget-action')) {
          const db = await getDatabase();
          await handleWidgetDeepLink(db, url);
        } else if (url.startsWith('cura://tasks')) {
          router.push('/(tabs)/tasks' as any);
        } else if (url.startsWith('cura://mood')) {
          router.push('/(tabs)/mood' as any);
        }
      } catch (err) {
        console.error('[RootNavigationLayout] Error processing deep link:', err);
      }
    };

    Linking.getInitialURL().then(processDeepLink);

    const linkingSub = Linking.addEventListener('url', (event) => {
      processDeepLink(event.url);
    });

    return () => {
      cleanupReconciliation();
      notifSub.remove();
      linkingSub.remove();
    };
  }, [router, selectConversation]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="modal"
        options={{
          presentation: 'modal',
          headerShown: false,
        }}
      />
      <Stack.Screen name="+not-found" options={{ title: 'Oops!' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <TaskProvider>
            <MoodProvider>
              <ChatProvider>
                <RootNavigationLayout />
              </ChatProvider>
            </MoodProvider>
          </TaskProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
