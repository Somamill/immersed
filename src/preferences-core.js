/* Shared by the iOS app and Mac study interface. Keep this dependency-free. */
(function (root) {
  const PREFERENCES_SCHEMA = 3;
  function restorePreferences(value) {
    const p = value && typeof value === "object" ? value : {};
    return {
      grouped: true,
      dark: typeof p.dark === "boolean" ? p.dark : true,
      hideShorts: typeof p.hideShorts === "boolean" ? p.hideShorts : true,
      minimumMinutes: [15, 30, 60].includes(p.minimumMinutes)
        ? p.minimumMinutes
        : 0,
      level: [1, 2, 3, 4, 5].includes(p.level) ? p.level : 5,
      knowledge:
        p.knowledge && typeof p.knowledge === "object"
          ? Object.fromEntries(
              Object.entries(p.knowledge).filter(
                ([key, value]) =>
                  key.length <= 120 && typeof value === "boolean",
              ),
            )
          : {},
      pitchAccent: p.pitchAccent === true,
      readings: typeof p.readings === "boolean" ? p.readings : true,
    };
  }
  const api = { PREFERENCES_SCHEMA, restorePreferences };
  if (typeof module === "object") module.exports = api;
  else root.ImmersedPreferences = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
