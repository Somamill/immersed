export const PREFERENCES_SCHEMA = 2;
export function restorePreferences(value: unknown) {
  const prefs = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    // Learning behavior is mandatory, including for older disabled preferences.
    grouped: true,
    dark: typeof prefs.dark === 'boolean' ? prefs.dark : true,
    hideShorts: typeof prefs.hideShorts === 'boolean' ? prefs.hideShorts : true,
    minimumMinutes: [15, 30, 60].includes(prefs.minimumMinutes as number) ? prefs.minimumMinutes as 15|30|60 : 0,
    level: [1,2,3,4,5].includes(prefs.level as number) ? prefs.level as 1|2|3|4|5 : 5,
    knowledge: prefs.knowledge && typeof prefs.knowledge === 'object' ? Object.fromEntries(Object.entries(prefs.knowledge).filter(([key, value]) => key.length <= 120 && typeof value === 'boolean')) as Record<string, boolean> : {},
    readings: typeof prefs.readings === 'boolean' ? prefs.readings : true,
  };
}
