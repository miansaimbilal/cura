import React from 'react';
import { View, Image, StyleSheet, ViewStyle, ImageSourcePropType } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { Text } from './Text';

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

export interface AvatarProps {
  name?: string;
  source?: ImageSourcePropType;
  size?: AvatarSize;
  badgeColor?: string;
  style?: ViewStyle;
}

export const Avatar = ({ name = 'User', source, size = 'md', badgeColor, style }: AvatarProps) => {
  const { theme } = useTheme();

  const getDimension = () => {
    switch (size) {
      case 'sm':
        return 32;
      case 'lg':
        return 56;
      case 'xl':
        return 72;
      case 'md':
      default:
        return 44;
    }
  };

  const dimension = getDimension();
  const radius = dimension / 2;

  const getInitials = (str: string) => {
    const parts = str.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return str.slice(0, 2).toUpperCase();
  };

  const containerStyle: ViewStyle = {
    width: dimension,
    height: dimension,
    borderRadius: radius,
    backgroundColor: theme.colors.surfaceElevated,
    borderColor: theme.colors.border,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  };

  const textVariant = size === 'sm' ? 'caption' : size === 'xl' ? 'heading2' : 'subheading';

  return (
    <View style={styles.wrapper}>
      <View style={[containerStyle, style]}>
        {source ? (
          <Image source={source} style={styles.image} resizeMode="cover" />
        ) : (
          <Text variant={textVariant} color={theme.colors.accent} weight="700">
            {getInitials(name)}
          </Text>
        )}
      </View>
      {badgeColor && (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: badgeColor,
              borderColor: theme.colors.surface,
              width: dimension * 0.28,
              height: dimension * 0.28,
              borderRadius: (dimension * 0.28) / 2,
            },
          ]}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    borderWidth: 2,
  },
});
