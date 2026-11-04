export const radius = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  full: 9999,

  // Component semantic radii
  button: 12,
  card: 16,
  cardLarge: 20,
  input: 12,
  badge: 8,
  modal: 24,
  avatar: 9999,
} as const;

export type RadiusScale = typeof radius;
