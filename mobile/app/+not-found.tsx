import React from 'react';
import { StyleSheet } from 'react-native';
import { Link, Stack } from 'expo-router';
import { ScreenContainer } from '../src/components/layout/ScreenContainer';
import { Text } from '../src/components/ui/Text';
import { Button } from '../src/components/ui/Button';
import { useTheme } from '../src/hooks/useTheme';

export default function NotFoundScreen() {
  const { theme } = useTheme();

  return (
    <>
      <Stack.Screen options={{ title: 'Page Not Found', headerShown: true }} />
      <ScreenContainer style={styles.container}>
        <Text variant="heading2" align="center" style={{ marginBottom: 8 }}>
          This screen does not exist.
        </Text>
        <Text variant="body" color={theme.colors.textSecondary} align="center" style={{ marginBottom: 24 }}>
          The requested route was not found in Cura.
        </Text>
        <Link href="/(tabs)/home" asChild>
          <Button title="Go to home screen" variant="primary" />
        </Link>
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
});
