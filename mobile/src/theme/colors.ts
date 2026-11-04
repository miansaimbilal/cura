export interface ColorTokens {
  // Backgrounds
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceSubtle: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;

  // Accents
  accent: string;
  accentSubtle: string;
  accentForeground: string;
  secondary: string;
  secondarySubtle: string;

  // Borders & Dividers
  border: string;
  borderSubtle: string;
  borderStrong: string;

  // Status & Feedback
  success: string;
  successSubtle: string;
  warning: string;
  warningSubtle: string;
  error: string;
  errorSubtle: string;
  info: string;
  infoSubtle: string;

  // Mood Tokens
  moods: {
    happy: string;
    calm: string;
    excited: string;
    okay: string;
    tired: string;
    stressed: string;
    sad: string;
    anxious: string;
    angry: string;
  };

  // Overlays
  overlay: string;
  cardHighlight: string;
}

export const darkColors: ColorTokens = {
  background: '#0D0E15',
  surface: '#151722',
  surfaceElevated: '#1D202F',
  surfaceSubtle: '#12141E',

  textPrimary: '#F1F3F9',
  textSecondary: '#A0A7BD',
  textMuted: '#687087',
  textInverse: '#0D0E15',

  accent: '#7B6FE8',
  accentSubtle: '#262447',
  accentForeground: '#FFFFFF',
  secondary: '#9D93F3',
  secondarySubtle: '#212239',

  border: '#25293C',
  borderSubtle: '#1B1E2E',
  borderStrong: '#363B54',

  success: '#34D399',
  successSubtle: '#133529',
  warning: '#FBBF24',
  warningSubtle: '#372B10',
  error: '#F87171',
  errorSubtle: '#37181B',
  info: '#38BDF8',
  infoSubtle: '#102A3C',

  moods: {
    happy: '#4ADE80',
    calm: '#38BDF8',
    excited: '#FBBF24',
    okay: '#94A3B8',
    tired: '#A78BFA',
    stressed: '#FB923C',
    sad: '#60A5FA',
    anxious: '#F472B6',
    angry: '#F87171',
  },

  overlay: 'rgba(5, 6, 10, 0.75)',
  cardHighlight: 'rgba(123, 111, 232, 0.08)',
};

export const lightColors: ColorTokens = {
  background: '#F8F9FC',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceSubtle: '#F1F3F8',

  textPrimary: '#141620',
  textSecondary: '#545C72',
  textMuted: '#8D96AE',
  textInverse: '#FFFFFF',

  accent: '#6454D8',
  accentSubtle: '#EEECFC',
  accentForeground: '#FFFFFF',
  secondary: '#7A6CE3',
  secondarySubtle: '#F3F2FD',

  border: '#E3E6F0',
  borderSubtle: '#ECEFF6',
  borderStrong: '#CBD1E1',

  success: '#10B981',
  successSubtle: '#E8FDF3',
  warning: '#F59E0B',
  warningSubtle: '#FEF6E7',
  error: '#EF4444',
  errorSubtle: '#FDECEC',
  info: '#0EA5E9',
  infoSubtle: '#E6F6FE',

  moods: {
    happy: '#22C55E',
    calm: '#0284C7',
    excited: '#D97706',
    okay: '#64748B',
    tired: '#8B5CF6',
    stressed: '#EA580C',
    sad: '#2563EB',
    anxious: '#DB2777',
    angry: '#DC2626',
  },

  overlay: 'rgba(15, 20, 35, 0.5)',
  cardHighlight: 'rgba(100, 84, 216, 0.04)',
};
