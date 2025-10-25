/**
 * Mana color utilities for WUBRG theming
 * Provides color constants, gradients, and glow effects for Magic: The Gathering color identity
 */

export const MANA_COLORS = {
  white: {
    primary: '#F0E68C',
    secondary: '#FFF8DC',
    glow: 'rgba(240, 230, 140, 0.4)',
  },
  blue: {
    primary: '#0E68AB',
    secondary: '#4A9FD8',
    glow: 'rgba(74, 159, 216, 0.4)',
  },
  black: {
    primary: '#150B00',
    secondary: '#4A4A4A',
    glow: 'rgba(74, 74, 74, 0.4)',
  },
  red: {
    primary: '#D32029',
    secondary: '#FF6B6B',
    glow: 'rgba(255, 107, 107, 0.4)',
  },
  green: {
    primary: '#00733E',
    secondary: '#4CAF50',
    glow: 'rgba(76, 175, 80, 0.4)',
  },
  // Brand colors
  brand: {
    primary: '#00e18c',
    secondary: '#009f6a',
    tertiary: '#3affc1',
    glow: 'rgba(0, 225, 140, 0.4)',
  },
} as const;

export type ManaColor = 'white' | 'blue' | 'black' | 'red' | 'green';

/**
 * Get glow box-shadow for a mana color
 */
export function getManaGlow(color: ManaColor | 'brand', intensity: number = 1): string {
  const colorData = color === 'brand' ? MANA_COLORS.brand : MANA_COLORS[color];
  const glowColor = colorData.glow.replace('0.4', String(0.4 * intensity));
  return `0 0 ${8 * intensity}px ${glowColor}, 0 0 ${16 * intensity}px ${glowColor}`;
}

/**
 * Get CSS gradient string for a mana color
 */
export function getManaGradient(color: ManaColor | 'brand', direction: string = 'to right'): string {
  const colorData = color === 'brand' ? MANA_COLORS.brand : MANA_COLORS[color];
  return `linear-gradient(${direction}, ${colorData.primary}, ${colorData.secondary})`;
}

/**
 * Get mana colors from color identity string (e.g., "WUG" -> ['white', 'blue', 'green'])
 */
export function parseColorIdentity(identity: string): ManaColor[] {
  const colorMap: Record<string, ManaColor> = {
    W: 'white',
    U: 'blue',
    B: 'black',
    R: 'red',
    G: 'green',
  };
  
  return identity.toUpperCase().split('').filter(c => c in colorMap).map(c => colorMap[c]);
}

/**
 * Get a mixed glow for multiple mana colors
 */
export function getMultiColorGlow(colors: ManaColor[], intensity: number = 1): string {
  if (colors.length === 0) return getManaGlow('brand', intensity);
  if (colors.length === 1) return getManaGlow(colors[0], intensity);
  
  // For multiple colors, blend the glows
  const glows = colors.map(color => {
    const colorData = MANA_COLORS[color];
    return colorData.primary;
  });
  
  // Create a combined glow with all colors
  return `0 0 ${8 * intensity}px rgba(${glows.map(() => '128').join(',')}, ${0.3 * intensity}), 0 0 ${16 * intensity}px rgba(${glows.map(() => '128').join(',')}, ${0.2 * intensity})`;
}

