import React from 'react';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '../src/components/layout/ScreenContainer';
import { Header } from '../src/components/layout/Header';
import { Text } from '../src/components/ui/Text';
import { Button } from '../src/components/ui/Button';
import { Card } from '../src/components/ui/Card';
import { useTheme } from '../src/hooks/useTheme';

export default function ModalScreen() {
  const router = useRouter();
  const { theme } = useTheme();

  return (
    <ScreenContainer
      header={
        <Header
          title="Information"
          subtitle="Application modal foundation"
          rightElement={
            <Button
              title="Close"
              variant="ghost"
              size="sm"
              onPress={() => router.back()}
            />
          }
        />
      }
    >
      <Card variant="surface" style={{ marginTop: 12 }}>
        <Text variant="heading3" style={{ marginBottom: 8 }}>
          Phase 1 Modal Foundation
        </Text>
        <Text variant="body" color={theme.colors.textSecondary} style={{ marginBottom: 16 }}>
          This screen establishes the navigation modal pattern within Expo Router, integrated with Cura design system tokens.
        </Text>
        <Button title="Dismiss" variant="primary" onPress={() => router.back()} />
      </Card>
    </ScreenContainer>
  );
}
