import { ViewStyle, Platform } from 'react-native';

export interface ShadowTokens {
  none: ViewStyle;
  subtle: ViewStyle;
  card: ViewStyle;
  elevated: ViewStyle;
  modal: ViewStyle;
}

export const darkShadows: ShadowTokens = {
  none: {
    ...Platform.select({
      ios: { shadowColor: 'transparent', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } },
      android: { elevation: 0 },
    }),
  },
  subtle: {
    ...Platform.select({
      ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  card: {
    ...Platform.select({
      ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 8 },
      android: { elevation: 4 },
    }),
  },
  elevated: {
    ...Platform.select({
      ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 16 },
      android: { elevation: 8 },
    }),
  },
  modal: {
    ...Platform.select({
      ios: { shadowColor: '#000000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.55, shadowRadius: 24 },
      android: { elevation: 12 },
    }),
  },
};

export const lightShadows: ShadowTokens = {
  none: {
    ...Platform.select({
      ios: { shadowColor: 'transparent', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 } },
      android: { elevation: 0 },
    }),
  },
  subtle: {
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  card: {
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  elevated: {
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16 },
      android: { elevation: 6 },
    }),
  },
  modal: {
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.14, shadowRadius: 24 },
      android: { elevation: 10 },
    }),
  },
};
