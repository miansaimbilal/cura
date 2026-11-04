import React from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  ViewStyle,
  RefreshControl,
  StyleProp,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/useTheme';

export interface ScreenContainerProps {
  children: React.ReactNode;
  scrollable?: boolean;
  withPadding?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  header?: React.ReactNode;
}

export const ScreenContainer = ({
  children,
  scrollable = true,
  withPadding = true,
  refreshing = false,
  onRefresh,
  style,
  contentContainerStyle,
  header,
}: ScreenContainerProps) => {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: insets.top,
  };

  const paddingHorizontal = withPadding ? theme.spacing.screenPadding : 0;

  return (
    <View style={[containerStyle, style]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {header}

      {scrollable ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingHorizontal,
              paddingBottom: insets.bottom + 24,
            },
            contentContainerStyle,
          ]}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.accent}
                colors={[theme.colors.accent]}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.staticContent,
            {
              paddingHorizontal,
              paddingBottom: insets.bottom + 16,
            },
            contentContainerStyle,
          ]}
        >
          {children}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingTop: 8,
  },
  staticContent: {
    flex: 1,
    paddingTop: 8,
  },
});
