import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { parseLanguageServer, type LanguageServerEntry } from './catalog'

// Language servers the user installed from the Store on this machine
// (userData/language-servers.json, never synced: what is installed differs
// per machine). Each record keeps the catalog entry as it was at install
// time, so a server keeps working offline or after the catalog drops it.
// Records are re-validated on read, so a hand-edited file can't smuggle in
// a binary name the catalog parser would refuse.

interface InstalledRecord {
  installedAt: number
  entry: LanguageServerEntry
}

export class InstalledServers {
  private records: InstalledRecord[]

  constructor(private readonly file: string) {
    this.records = this.read()
  }

  list(): LanguageServerEntry[] {
    return this.records.map((r) => r.entry)
  }

  get(id: string): LanguageServerEntry | null {
    return this.records.find((r) => r.entry.id === id)?.entry ?? null
  }

  // The installed server answering for a Monaco language id, if any.
  forLanguage(language: string): LanguageServerEntry | null {
    return this.records.find((r) => r.entry.languages.includes(language))?.entry ?? null
  }

  // Adds or replaces (a reinstall refreshes the snapshot).
  add(entry: LanguageServerEntry): void {
    this.records = [...this.records.filter((r) => r.entry.id !== entry.id), { installedAt: Date.now(), entry }]
    this.write()
  }

  remove(id: string): boolean {
    const before = this.records.length
    this.records = this.records.filter((r) => r.entry.id !== id)
    if (this.records.length === before) return false
    this.write()
    return true
  }

  private read(): InstalledRecord[] {
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(this.file, 'utf8'))
    } catch {
      return []
    }
    if (!Array.isArray(raw)) return []
    const out: InstalledRecord[] = []
    for (const item of raw) {
      const rec = item as { installedAt?: unknown; entry?: unknown }
      const entry = parseLanguageServer(rec?.entry)
      if (typeof entry === 'string') continue
      if (out.some((r) => r.entry.id === entry.id)) continue
      out.push({ installedAt: typeof rec.installedAt === 'number' ? rec.installedAt : 0, entry })
    }
    return out
  }

  private write(): void {
    try {
      mkdirSync(dirname(this.file), { recursive: true })
      const tmp = `${this.file}.tmp`
      writeFileSync(tmp, JSON.stringify(this.records, null, 2))
      renameSync(tmp, this.file)
    } catch (e) {
      console.error('[lsp] could not save installed language servers:', e)
    }
  }
}
