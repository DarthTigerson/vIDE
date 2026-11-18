import { readFile } from 'fs/promises'
import { join } from 'path'

// Same "packaged files land at the app root" pattern used for icon.png
// (see main.ts's dock icon path) — out/main/index.js is two levels below
// the root both in dev and in a packaged app.asar.
const CHANGELOG_PATH = join(__dirname, '../../CHANGELOG.md')

// The release severity marker (see electron/updateChecker.ts) is for the
// update checker only: the in-app changelog renders raw HTML as text.
const MARKER_LINE = /^\s*<!--\s*vide-update:[^>]*-->\s*$/

function isMarkerLine(line: string): boolean {
  return MARKER_LINE.test(line)
}

export function extractVersionSection(changelog: string, version: string): string | null {
  const lines = changelog.split('\n')
  const startIdx = lines.findIndex((line) => {
    const match = line.match(/^##\s+v?([\d.]+)/)
    return match?.[1] === version
  })
  if (startIdx === -1) return null

  let endIdx = lines.length
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^##\s+v?[\d.]+/.test(lines[i])) {
      endIdx = i
      break
    }
  }

  return lines.slice(startIdx, endIdx).filter((line) => !isMarkerLine(line)).join('\n').trim()
}

export interface ChangelogRelease {
  version: string
  date: string | null // YYYY-MM-DD, as written in the heading
  body: string // the notes, without the "## vX (date)" heading
}

// Every release in the changelog, newest first as written — for the release
// history in Settings > About (VIDE-143).
export function parseChangelog(changelog: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = []
  let current: { version: string; date: string | null; lines: string[] } | null = null
  const push = () => {
    if (current) releases.push({ version: current.version, date: current.date, body: current.lines.join('\n').trim() })
  }
  for (const line of changelog.split('\n')) {
    const heading = line.match(/^##\s+v?([\d.]+)(?:\s+\(([\d-]+)\))?/)
    if (heading) {
      push()
      current = { version: heading[1], date: heading[2] ?? null, lines: [] }
    } else if (current && !isMarkerLine(line)) {
      current.lines.push(line)
    }
  }
  push()
  return releases
}

export async function getChangelogReleases(): Promise<ChangelogRelease[]> {
  try {
    return parseChangelog(await readFile(CHANGELOG_PATH, 'utf-8'))
  } catch {
    return []
  }
}

export async function getChangelogForVersion(version: string): Promise<string | null> {
  try {
    const changelog = await readFile(CHANGELOG_PATH, 'utf-8')
    return extractVersionSection(changelog, version)
  } catch {
    return null
  }
}
