import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ScreenContainer } from '../../src/components/layout/ScreenContainer';
import { Header } from '../../src/components/layout/Header';
import { Text } from '../../src/components/ui/Text';
import { Card } from '../../src/components/ui/Card';
import { Input } from '../../src/components/ui/Input';
import { Button } from '../../src/components/ui/Button';
import { useAuth } from '../../src/services/auth/authContext';
import { useTheme } from '../../src/providers/ThemeProvider';

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const { theme } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setErrorMessage('Please enter both email and password');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const result = await login(email.trim(), password);
    setLoading(false);

    if (result.success) {
      router.replace('/(tabs)/home' as any);
    } else {
      setErrorMessage(result.error || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <ScreenContainer
      scrollable
      header={
        <Header
          title="Sign In"
          subtitle="Access your synced reflections and tasks"
        />
      }
    >
      <Card variant="surface" style={styles.card}>
        {errorMessage && (
          <View style={[styles.errorContainer, { backgroundColor: theme.colors.errorSubtle }]}>
            <Text variant="bodySmall" color={theme.colors.error} weight="600">
              {errorMessage}
            </Text>
          </View>
        )}

        <Input
          label="Email Address"
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={(val) => {
            setEmail(val);
            if (errorMessage) setErrorMessage(null);
          }}
          containerStyle={styles.inputSpacing}
        />

        <Input
          label="Password"
          placeholder="••••••••"
          secureTextEntry
          value={password}
          onChangeText={(val) => {
            setPassword(val);
            if (errorMessage) setErrorMessage(null);
          }}
          containerStyle={styles.inputSpacing}
        />

        <Button
          title="Sign In"
          variant="primary"
          size="lg"
          fullWidth
          loading={loading}
          onPress={handleLogin}
          style={styles.actionButton}
        />

        <View style={styles.footerRow}>
          <Text variant="bodySmall" color={theme.colors.textMuted}>
            Don't have an account?{' '}
          </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/register' as any)}>
            <Text variant="bodySmall" color={theme.colors.accent} weight="600">
              Register
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => router.replace('/(tabs)/home' as any)}
          style={styles.guestLink}
        >
          <Text variant="caption" color={theme.colors.textSecondary} style={{ textAlign: 'center' }}>
            Continue as Guest
          </Text>
        </TouchableOpacity>
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 24,
    marginTop: 12,
  },
  errorContainer: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  inputSpacing: {
    marginBottom: 16,
  },
  actionButton: {
    marginTop: 8,
    marginBottom: 20,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  guestLink: {
    paddingVertical: 8,
  },
});
