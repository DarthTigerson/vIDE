// Guards vIDE Sync against config written by a NEWER version of vIDE.
//
// The crash this prevents: a newer build adds a theme/background option, a
// user picks it, and vIDE Sync pushes that value to their other machines. An
// older build then pulls a value it has never heard of and applies it on
// startup, which historically broke the app before it could render (VIDE-162).
//
// Two independent signals mark config as incompatible:
//   1. A schema-version stamp in the repo that exceeds what this build knows
//      (see electron/configRepo.ts CONFIG_SCHEMA_VERSION) — the explicit,
//      general signal.
//   2. A synced enum value outside the sets below — the self-maintaining
//      safety net for when someone adds an option but forgets to bump the
//      schema version.
//
// Kept deliberately free of any store import so it can run before a single
// Zustand store initializes (themeStore/displayStore apply values at module
// load, which must happen AFTER pre-boot sync has written localStorage).

// localStorage keys whose value is a closed set of enum options this build can
// render. Values are stored raw (not JSON-encoded) — e.g. localStorage
// 'vide:theme' === 'thomas-dark' — so they compare as plain strings.
//
// Drift against the real option lists (THEME_OPTIONS / BACKGROUND_IMAGE_OPTIONS)
// is caught by src/lib/__tests__/syncCompat.test.ts.
export const KNOWN_SYNCED_ENUMS: Record<string, readonly string[]> = {
  'vide:theme': [
    'claude-dark', 'claude-light',
    'thomas-dark', 'thomas-light',
    'malta-dark', 'malta-light',
    'luuk-dark', 'luuk-light',
    'borahae-dark', 'borahae-light',
    'link-dark', 'link-light',
    'atreus-dark', 'atreus-light',
    'gabriele-dark', 'gabriele-light',
  ],
  'vide:backgroundImage': [
    'none', 'vide', 'clawd', 'link', 'atreus', 'borahae',
    'gabriele', 'rockhoppers', 'goodGirl', 'techLines', 'wave', 'malta',
  ],
}

// Returns the first synced value that this build can't render, or null when
// every value is known. `data` is the per-category map returned by
// configRepoPull (category → { localStorageKey: rawValue }).
export function findIncompatibleSyncValue(
  data: Record<string, Record<string, string>>,
): { key: string; value: string } | null {
  for (const kvMap of Object.values(data)) {
    for (const [key, value] of Object.entries(kvMap)) {
      const allowed = KNOWN_SYNCED_ENUMS[key]
      if (allowed && !allowed.includes(value)) return { key, value }
    }
  }
  return null
}
