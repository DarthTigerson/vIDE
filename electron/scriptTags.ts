import { join } from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'

// Which projects each script has been run in (scriptId → project roots).
// Machine-local and never synced: project paths differ between machines, and
// a synced file that changes on every run would commit on every push.
export type ScriptTags = Record<string, string[]>

function tagsFile(dataDir: string): string {
  return join(dataDir, 'script-tags.json')
}

export async function readScriptTags(dataDir: string): Promise<ScriptTags> {
  try {
    const parsed = JSON.parse(await readFile(tagsFile(dataDir), 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

async function writeScriptTags(dataDir: string, tags: ScriptTags): Promise<void> {
  await mkdir(dataDir, { recursive: true })
  await writeFile(tagsFile(dataDir), JSON.stringify(tags, null, 2), 'utf8')
}

export async function addScriptTag(dataDir: string, scriptId: string, projectRoot: string): Promise<ScriptTags> {
  const tags = await readScriptTags(dataDir)
  const roots = tags[scriptId] ?? []
  if (roots.includes(projectRoot)) return tags
  tags[scriptId] = [...roots, projectRoot]
  await writeScriptTags(dataDir, tags)
  return tags
}

export async function removeScriptTag(dataDir: string, scriptId: string, projectRoot: string): Promise<ScriptTags> {
  const tags = await readScriptTags(dataDir)
  const roots = (tags[scriptId] ?? []).filter((r) => r !== projectRoot)
  if (roots.length) tags[scriptId] = roots
  else delete tags[scriptId]
  await writeScriptTags(dataDir, tags)
  return tags
}
