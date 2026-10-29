export const PREFERENCES_SCHEMA = 2;
export function restorePreferences(value: unknown) {
  const prefs = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    // Older drafts persisted experimental morpheme mode. Reset that once, while
    // continuing to honor deliberate choices made in this release and later.
    grouped: prefs.schema === PREFERENCES_SCHEMA && typeof prefs.grouped === 'boolean' ? prefs.grouped : true,
    readings: typeof prefs.readings === 'boolean' ? prefs.readings : true,
    automatic: typeof prefs.automatic === 'boolean' ? prefs.automatic : true,
  };
}
