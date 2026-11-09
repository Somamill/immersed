export const PREFERENCES_SCHEMA: number;
export function restorePreferences(value: unknown): {
  grouped: boolean;
  dark: boolean;
  hideShorts: boolean;
  minimumMinutes: 0 | 15 | 30 | 60;
  level: 1 | 2 | 3 | 4 | 5;
  knowledge: Record<string, boolean>;
  pitchAccent: boolean;
  readings: boolean;
};
