import { darkColors, lightColors, ColorTokens } from './colors';
import { typography } from './typography';
import { spacing } from './spacing';
import { radius } from './radius';
import { darkShadows, lightShadows, ShadowTokens } from './shadows';

export type ThemeMode = 'dark' | 'light' | 'system';

export interface Theme {
  mode: 'dark' | 'light';
  colors: ColorTokens;
  typography: typeof typography;
  spacing: typeof spacing;
  radius: typeof radius;
  shadows: ShadowTokens;
  isDark: boolean;
}

export const createTheme = (mode: 'dark' | 'light'): Theme => ({
  mode,
  colors: mode === 'dark' ? darkColors : lightColors,
  typography,
  spacing,
  radius,
  shadows: mode === 'dark' ? darkShadows : lightShadows,
  isDark: mode === 'dark',
});

export * from './colors';
export * from './typography';
export * from './spacing';
export * from './radius';
export * from './shadows';
