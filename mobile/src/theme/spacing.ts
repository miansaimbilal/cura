export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  massive: 48,

  // Semantic layout spacing
  screenPadding: 20,
  cardPadding: 16,
  cardGap: 12,
  sectionGap: 24,
  rowGap: 8,
} as const;

export type SpacingScale = typeof spacing;
