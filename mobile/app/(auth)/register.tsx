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

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useAuth();
  const { theme } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRegister = async () => {
    if (!email.trim() || !password) {
      setErrorMessage('Please fill in all fields');
      return;
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const result = await register(email.trim(), password);
    setLoading(false);

    if (result.success) {
      router.replace('/(tabs)/home' as any);
    } else {
      setErrorMessage(result.error || 'Registration failed. Please try again.');
    }
  };

  return (
    <ScreenContainer
      scrollable
      header={
        <Header
          title="Create Account"
          subtitle="Sync your wellness journey across devices"
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
          label="Password (min. 8 characters)"
          placeholder="••••••••"
          secureTextEntry
          value={password}
          onChangeText={(val) => {
            setPassword(val);
            if (errorMessage) setErrorMessage(null);
          }}
          containerStyle={styles.inputSpacing}
        />

        <Input
          label="Confirm Password"
          placeholder="••••••••"
          secureTextEntry
          value={confirmPassword}
          onChangeText={(val) => {
            setConfirmPassword(val);
            if (errorMessage) setErrorMessage(null);
          }}
          containerStyle={styles.inputSpacing}
        />

        <Button
          title="Create Account"
          variant="primary"
          size="lg"
          fullWidth
          loading={loading}
          onPress={handleRegister}
          style={styles.actionButton}
        />

        <View style={styles.footerRow}>
          <Text variant="bodySmall" color={theme.colors.textMuted}>
            Already have an account?{' '}
          </Text>
          <TouchableOpacity onPress={() => router.push('/(auth)/login' as any)}>
            <Text variant="bodySmall" color={theme.colors.accent} weight="600">
              Sign In
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
