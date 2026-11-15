// Parsing and validation of a store app's `manifest.json`. Pure (no Electron
// imports) so it unit-tests in plain node.
// Spec: docs/superpowers/specs/2026-11-15-vsuite-store-design.md

import { ID_RE, SEMVER_RE } from '../storeRegistry'

export const APP_API_VERSION = 1

export interface AppContributes {
  sidebarPanel?: { title: string }
  settingsPage?: { title: string }
  tabKinds?: string[]
  commands?: boolean
  notifications?: boolean
  agentTools?: boolean
}

// A tool an app offers to AI agents. The handler lives in the app's main.js.
export interface AgentToolDecl {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface AgentToolsDecl {
  instructions?: string
  tools: AgentToolDecl[]
}

export const TOOL_NAME_RE = /^[a-z][a-z0-9_]{0,63}$/
export const MAX_AGENT_TOOLS = 32

export interface AppManifest {
  id: string
  name: string
  version: string
  apiVersion: number
  minVide: string
  renderer: string
  main?: string
  icon?: string
  // Store page text and images: package-relative paths, shown on the app's page.
  description?: string
  screenshots?: string[]
  // App stylesheet, loaded while the app is active.
  style?: string
  agentTools?: AgentToolsDecl
  contributes: AppContributes
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// A path inside the package: non-empty, relative, no `..` segments, no backslashes.
function isSafeRelPath(value: unknown): value is string {
  if (typeof value !== 'string' || value === '') return false
  if (value.startsWith('/') || value.includes('\\')) return false
  return !value.split('/').includes('..')
}

const MAX_SCREENSHOTS = 8

// A bad tool is dropped, never the install; so is a whole malformed block.
function parseAgentTools(raw: unknown): AgentToolsDecl | undefined {
  if (!isObject(raw) || !Array.isArray(raw.tools)) return undefined
  const tools: AgentToolDecl[] = []
  const seen = new Set<string>()
  for (const t of raw.tools) {
    if (tools.length >= MAX_AGENT_TOOLS) break
    if (!isObject(t)) continue
    const { name, description, inputSchema } = t
    if (typeof name !== 'string' || !TOOL_NAME_RE.test(name) || seen.has(name)) continue
    if (typeof description !== 'string' || description.trim() === '') continue
    if (!isObject(inputSchema) || inputSchema.type !== 'object') continue
    seen.add(name)
    tools.push({ name, description, inputSchema })
  }
  if (tools.length === 0) return undefined
  const instructions = typeof raw.instructions === 'string' && raw.instructions.trim() !== '' ? raw.instructions : undefined
  return { ...(instructions !== undefined ? { instructions } : {}), tools }
}

function parseContributes(raw: unknown): AppContributes {
  if (!isObject(raw)) return {}
  const out: AppContributes = {}
  const title = (v: unknown): { title: string } | undefined =>
    isObject(v) && typeof v.title === 'string' ? { title: v.title } : undefined
  const sidebarPanel = title(raw.sidebarPanel)
  if (sidebarPanel) out.sidebarPanel = sidebarPanel
  const settingsPage = title(raw.settingsPage)
  if (settingsPage) out.settingsPage = settingsPage
  if (Array.isArray(raw.tabKinds) && raw.tabKinds.every((k) => typeof k === 'string')) {
    out.tabKinds = [...(raw.tabKinds as string[])]
  }
  for (const key of ['commands', 'notifications', 'agentTools'] as const) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key] as boolean
  }
  return out
}

// Does not check `apiVersion === APP_API_VERSION`: the installer does, so it
// can say "built for a newer vIDE".
export function parseManifest(raw: unknown): AppManifest | string {
  if (!isObject(raw)) return 'not an object'
  const { id, name, version, apiVersion, minVide, renderer, main, icon, style, contributes } = raw
  if (typeof id !== 'string' || !ID_RE.test(id)) return 'bad id'
  if (typeof name !== 'string' || name.trim() === '') return 'bad name'
  if (typeof version !== 'string' || !SEMVER_RE.test(version)) return 'bad version'
  if (typeof apiVersion !== 'number' || !Number.isInteger(apiVersion) || apiVersion < 1) return 'bad apiVersion'
  if (typeof minVide !== 'string' || !SEMVER_RE.test(minVide)) return 'bad minVide'
  if (!isSafeRelPath(renderer)) return 'bad renderer'
  if (main !== undefined && !isSafeRelPath(main)) return 'bad main'
  if (icon !== undefined && !isSafeRelPath(icon)) return 'bad icon'
  if (style !== undefined && !isSafeRelPath(style)) return 'bad style'
  // Page-only extras: a bad value is dropped, it never fails the install.
  const description = typeof raw.description === 'string' && raw.description.trim() !== '' ? raw.description : undefined
  const screenshots =
    Array.isArray(raw.screenshots) && raw.screenshots.length > 0 && raw.screenshots.length <= MAX_SCREENSHOTS &&
    raw.screenshots.every(isSafeRelPath)
      ? [...(raw.screenshots as string[])]
      : undefined
  const manifest: AppManifest = {
    id, name, version, apiVersion, minVide, renderer,
    contributes: parseContributes(contributes)
  }
  if (main !== undefined) manifest.main = main
  if (icon !== undefined) manifest.icon = icon
  if (style !== undefined) manifest.style = style
  if (description !== undefined) manifest.description = description
  if (screenshots !== undefined) manifest.screenshots = screenshots
  const agentTools = parseAgentTools(raw.agentTools)
  if (agentTools) manifest.agentTools = agentTools
  return manifest
}
