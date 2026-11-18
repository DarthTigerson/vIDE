import { clampSize } from './panelSize'

// The side panel and the chat panel are sized in rem, not as a share of the
// window: a percentage made the file tree ~900px wide on a big screen and
// ignored the text size entirely. In rem the panels keep their width when the
// window grows (the editor takes the room) and scale with View > text size,
// like VS Code. The limits mix units (a rem max capped at a share of the
// group), which react-resizable-panels can't express in one size, so App
// sizes the panels in percentages of the group (passed as "N%" strings — a
// bare number means px since v4) and converts with the helpers below whenever
// the group width or the root font size changes.

export interface RemPanelSpec {
  defaultRem: number
  minRem: number
  maxRem: number
  /** Never more than this share of the panel group, however wide the rem max. */
  maxFraction: number
}

export const SIDEBAR_PANEL: RemPanelSpec = { defaultRem: 18, minRem: 12, maxRem: 40, maxFraction: 0.5 }
export const CHAT_PANEL: RemPanelSpec = { defaultRem: 32, minRem: 20, maxRem: 64, maxFraction: 0.5 }

function maxRemFor(spec: RemPanelSpec, groupPx: number, rootPx: number): number {
  return Math.min(spec.maxRem, (groupPx * spec.maxFraction) / rootPx)
}

export function clampRem(rem: number, spec: RemPanelSpec, groupPx: number, rootPx: number): number {
  const max = maxRemFor(spec, groupPx, rootPx)
  return clampSize(rem, Math.min(spec.minRem, max), max)
}

export function remToPercent(rem: number, groupPx: number, rootPx: number): number {
  return groupPx > 0 ? ((rem * rootPx) / groupPx) * 100 : 0
}

export function percentToRem(percent: number, groupPx: number, rootPx: number): number {
  return rootPx > 0 ? ((percent / 100) * groupPx) / rootPx : 0
}

export function percentLimits(spec: RemPanelSpec, groupPx: number, rootPx: number): { min: number; max: number } {
  const max = maxRemFor(spec, groupPx, rootPx)
  return {
    min: remToPercent(Math.min(spec.minRem, max), groupPx, rootPx),
    max: remToPercent(max, groupPx, rootPx),
  }
}

export function loadRem(key: string, spec: RemPanelSpec): number {
  const raw = localStorage.getItem(key)
  if (raw === null) return spec.defaultRem
  const stored = Number(raw)
  return Number.isFinite(stored) ? clampSize(stored, spec.minRem, spec.maxRem) : spec.defaultRem
}
