import React from 'react';
import { Stack, Redirect } from 'expo-router';
import { useAuth } from '../../src/services/auth/authContext';
import { useTheme } from '../../src/providers/ThemeProvider';

export default function AuthLayout() {
  const { isGuest, isLoading } = useAuth();
  const { theme } = useTheme();

  // If already authenticated and not loading, redirect to main app tabs
  if (!isLoading && !isGuest) {
    return <Redirect href="/(tabs)/home" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.background },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="login" options={{ title: 'Login' }} />
      <Stack.Screen name="register" options={{ title: 'Register' }} />
    </Stack>
  );
}
