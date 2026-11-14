import { dotTokens } from '../branding/dot/tokens';

/** Shared chrome roles; learning-state colors and the video stage stay independent. */
export function dotPalette(dark: boolean) {
  const colors = dotTokens.colors[dark ? 'dark' : 'light'];
  const accent = dotTokens.colors[dark ? 'accentsDark' : 'accents'].immersed;
  return { ...colors, accent, onAccent: dotTokens.colors.onAccent[dark ? 'dark' : 'light'], softAccent: `${accent}18` };
}
export { dotTokens };
