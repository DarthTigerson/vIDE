import { create } from 'zustand'
import { useThemeStore, familyOf, THEME_OPTIONS } from './themeStore'
import { useCustomThemeStore } from './customThemeStore'
import { localDayIndex, shuffleFamilyFor } from '@/lib/themeShuffle'
import { notifySettingChanged } from '@/lib/notifySettingChanged'
import { onOtherWindowChange } from '@/lib/crossWindowSettings'

// "Shuffle daily" (Settings › Display › Theme): a different built-in family
// each day, picked from the date (src/lib/themeShuffle.ts). Custom themes are
// never in the pool. Appearance (light/dark/system) is left alone, and the
// background follows the family as it already does (displayStore).
//
// A hand pick holds for the rest of the day: the shuffle only applies once
// per local day, tracked by LAST_DAY_KEY, so picking a theme after it ran
// sticks until tomorrow. Both keys start with 'vide:theme', so they sync
// with the theme itself (configRepoStore's general category).
const ENABLED_KEY = 'vide:themeShuffleDaily'
const LAST_DAY_KEY = 'vide:themeShuffleLastDay'

// How often a running app checks whether midnight has passed.
const CHECK_INTERVAL_MS = 60_000

export const SHUFFLE_FAMILIES: readonly string[] = Array.from(new Set(THEME_OPTIONS.map((t) => familyOf(t.id))))

function readLastDay(): number | null {
  const raw = localStorage.getItem(LAST_DAY_KEY)
  const n = raw === null ? NaN : Number(raw)
  return Number.isFinite(n) ? n : null
}

// Today's family, never the one currently showing (that would be no change
// at all after a hand pick of today's family).
export function familyForDay(dayIndex: number, current: string): string {
  const pick = shuffleFamilyFor(dayIndex, SHUFFLE_FAMILIES)
  if (pick !== current) return pick
  return SHUFFLE_FAMILIES[(SHUFFLE_FAMILIES.indexOf(pick) + 1) % SHUFFLE_FAMILIES.length]
}

interface ThemeShuffleStore {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
  // Applies today's pick if shuffle is on and it hasn't run yet today.
  applyIfDue: (now?: Date) => void
}

function applyFamily(family: string, day: number) {
  useCustomThemeStore.getState().setActive(null)
  useThemeStore.getState().setFamily(family)
  localStorage.setItem(LAST_DAY_KEY, String(day))
}

export const useThemeShuffleStore = create<ThemeShuffleStore>((set, get) => ({
  enabled: localStorage.getItem(ENABLED_KEY) === 'true',
  setEnabled: (enabled) => {
    localStorage.setItem(ENABLED_KEY, String(enabled))
    set({ enabled })
    if (enabled) {
      // Switching on changes the theme straight away, so the toggle visibly
      // does something; it then holds until tomorrow.
      const day = localDayIndex(new Date())
      applyFamily(familyForDay(day, familyOf(useThemeStore.getState().theme)), day)
    }
    notifySettingChanged()
  },
  applyIfDue: (now = new Date()) => {
    if (!get().enabled) return
    const day = localDayIndex(now)
    if (readLastDay() === day) return
    applyFamily(familyForDay(day, familyOf(useThemeStore.getState().theme)), day)
    notifySettingChanged()
  },
}))

// Runs the shuffle on launch, after midnight while open, and on focus (a
// laptop woken the next morning). Returns a stop function.
export function startThemeShuffle(): () => void {
  const check = () => useThemeShuffleStore.getState().applyIfDue()
  check()
  const interval = setInterval(check, CHECK_INTERVAL_MS)
  window.addEventListener('focus', check)
  return () => {
    clearInterval(interval)
    window.removeEventListener('focus', check)
  }
}

onOtherWindowChange([ENABLED_KEY], () => {
  useThemeShuffleStore.setState({ enabled: localStorage.getItem(ENABLED_KEY) === 'true' })
})
