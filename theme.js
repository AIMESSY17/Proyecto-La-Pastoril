export function restoreThemePreference(readPreference, storageKeys, automaticTheme) {
  const savedTheme = readPreference(storageKeys.theme);
  const legacyNight = readPreference(storageKeys.legacyNight);
  const manualTheme = savedTheme === 'day' || savedTheme === 'night'
    ? savedTheme
    : legacyNight === null ? null : legacyNight === 'true' ? 'night' : 'day';
  return {
    manualTheme,
    initialTheme: manualTheme || automaticTheme(),
  };
}
