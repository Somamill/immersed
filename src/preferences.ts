export const PREFERENCES_SCHEMA = 2;
export function restorePreferences(value: unknown) {
  const prefs = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    // Older drafts persisted experimental morpheme mode. Reset that once, while
    // continuing to honor deliberate choices made in this release and later.
    grouped: prefs.schema === PREFERENCES_SCHEMA && typeof prefs.grouped === 'boolean' ? prefs.grouped : true,
    dark: typeof prefs.dark === 'boolean' ? prefs.dark : true,
    hideShorts: typeof prefs.hideShorts === 'boolean' ? prefs.hideShorts : true,
    tall: prefs.layoutSchema === 2 && typeof prefs.tall === 'boolean' ? prefs.tall : true,
    level: [1,2,3,4,5].includes(prefs.level as number) ? prefs.level as 1|2|3|4|5 : 5,
    knowledge: prefs.knowledge && typeof prefs.knowledge === 'object' ? Object.fromEntries(Object.entries(prefs.knowledge).filter(([key, value]) => key.length <= 120 && typeof value === 'boolean')) as Record<string, boolean> : {},
    readings: typeof prefs.readings === 'boolean' ? prefs.readings : true,
  };
}
