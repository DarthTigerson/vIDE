// The usage panel's bike gauges moved to the Bike Gauge store app. A saved
// 'gauges' view becomes that app's view id, so the dials come back on their
// own once the app is installed (Bars shows until then). Per machine, like
// the key itself. Spec: docs/superpowers/specs/2026-11-19-usage-views-design.md

export const USAGE_VIEW_KEY = 'vide:usagePanelView'

export function migrateUsageView(store: Pick<Storage, 'getItem' | 'setItem'>): void {
  if (store.getItem(USAGE_VIEW_KEY) === 'gauges') store.setItem(USAGE_VIEW_KEY, 'app:bike-gauge')
}
