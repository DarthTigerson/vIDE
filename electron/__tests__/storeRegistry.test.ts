import { describe, it, expect, vi } from 'vitest'
import { parseRegistry, type StoreApp } from '../storeRegistry'

const SHA = 'a'.repeat(40)
const SUM = 'b'.repeat(64)

function entry(overrides: Record<string, unknown> = {}, latest: Record<string, unknown> = {}) {
  return {
    id: 'docker',
    name: 'Docker',
    description: 'Containers from the sidebar.',
    repo: 'DarthTigerson/vIDE---Docker-App',
    firstParty: true,
    latest: {
      version: '1.0.0',
      commit: SHA,
      url: 'https://github.com/x/y/releases/download/v1.0.0/docker-1.0.0.zip',
      sha256: SUM,
      minVide: '0.4.0',
      notesUrl: 'https://github.com/x/y/releases/tag/v1.0.0',
      ...latest,
    },
    replacesBuiltIn: 'docker',
    ...overrides,
  }
}

function apps(raw: unknown): StoreApp[] {
  const parsed = parseRegistry(raw)
  if (parsed.kind !== 'ok') throw new Error(`expected ok, got ${parsed.kind}`)
  return parsed.apps
}

describe('parseRegistry', () => {
  it('parses a valid entry', () => {
    const result = apps({ schema: 1, apps: [entry()] })
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ ...entry(), recommended: false, category: 'applications', targets: ['vide'] })
  })

  it('reads the Store-page fields when present', () => {
    const [app] = apps({ schema: 1, apps: [entry({ recommended: true, category: 'applications', targets: ['vide', 'other'] })] })
    expect(app.recommended).toBe(true)
    expect(app.category).toBe('applications')
    expect(app.targets).toEqual(['vide', 'other'])
  })

  it('drops an entry with malformed Store-page fields', () => {
    const result = apps({
      schema: 1,
      apps: [
        entry({ id: 'bad-rec', recommended: 'yes' }),
        entry({ id: 'bad-cat', category: 'Not Valid' }),
        entry({ id: 'bad-targets', targets: 'vide' }),
        entry({ id: 'good' }),
      ],
    })
    expect(result.map((a) => a.id)).toEqual(['good'])
  })

  it('returns too-new for a higher schema', () => {
    expect(parseRegistry({ schema: 2, apps: [] })).toEqual({ kind: 'too-new' })
  })

  it('returns invalid for a missing schema, non-array apps, or a non-object', () => {
    expect(parseRegistry({ apps: [] }).kind).toBe('invalid')
    expect(parseRegistry({ schema: 1, apps: {} }).kind).toBe('invalid')
    expect(parseRegistry('<html>').kind).toBe('invalid')
    expect(parseRegistry(null).kind).toBe('invalid')
  })

  it('drops bad entries one by one and keeps the rest', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = apps({
      schema: 1,
      apps: [
        entry({ id: 'good' }),
        entry({ id: 'no-first-party', firstParty: undefined }),
        entry({ id: 'short-commit' }, { commit: 'a'.repeat(39) }),
        entry({ id: 'bad-sum' }, { sha256: 'z'.repeat(64) }),
        entry({ id: 'bad-version' }, { version: '1.0' }),
        entry({ id: 'bad-min' }, { minVide: 'latest' }),
        entry({ id: 'http-url' }, { url: 'http://example.com/a.zip' }),
        entry({ id: 'Bad_Id' }),
        entry({ id: 'no-name', name: '' }),
        entry({ id: 'no-latest', latest: undefined }),
        'not an object',
      ],
    })
    expect(result.map((a) => a.id)).toEqual(['good'])
  })

  it('ignores unknown fields', () => {
    const result = apps({ schema: 1, extra: true, apps: [entry({ icon: 'x.svg' }, { size: 10 })] })
    expect(result[0]).not.toHaveProperty('icon')
    expect(result[0].latest).not.toHaveProperty('size')
  })

  it('keeps notesUrl and replacesBuiltIn optional', () => {
    const e = entry({ replacesBuiltIn: undefined }, { notesUrl: undefined })
    const result = apps({ schema: 1, apps: [e] })
    expect(result[0].latest.notesUrl).toBeUndefined()
    expect(result[0].replacesBuiltIn).toBeUndefined()
  })

  it('drops duplicate ids after the first', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = apps({ schema: 1, apps: [entry({ name: 'First' }), entry({ name: 'Second' })] })
    expect(result.map((a) => a.name)).toEqual(['First'])
  })

  it('sorts by name, case-insensitive', () => {
    const result = apps({
      schema: 1,
      apps: [entry({ id: 'b', name: 'jira' }), entry({ id: 'a', name: 'Docker' }), entry({ id: 'c', name: 'Graphify' })],
    })
    expect(result.map((a) => a.name)).toEqual(['Docker', 'Graphify', 'jira'])
  })

  describe('optional page fields', () => {
    const full = {
      icon: 'https://vsuite.tech/apps/docker/icon.svg',
      screenshots: ['https://vsuite.tech/apps/docker/shot-1.png', 'https://vsuite.tech/apps/docker/shot-2.png'],
      readmeUrl: 'https://vsuite.tech/apps/docker/readme.md',
      size: 15234,
      publishedAt: '2026-11-15T10:00:00Z',
    }

    it('keeps valid icon, screenshots, readmeUrl, size and publishedAt', () => {
      const [app] = apps({ schema: 1, apps: [entry(full)] })
      expect(app).toMatchObject(full)
    })

    it('leaves them off when the entry has none', () => {
      const [app] = apps({ schema: 1, apps: [entry()] })
      for (const key of ['icon', 'screenshots', 'readmeUrl', 'size', 'publishedAt']) expect(app).not.toHaveProperty(key)
    })

    it('drops a non-https field alone and keeps the entry and the other fields', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const [app] = apps({ schema: 1, apps: [entry({ ...full, icon: 'http://x/icon.png', readmeUrl: 'ftp://x/readme.md' })] })
      expect(app.id).toBe('docker')
      expect(app).not.toHaveProperty('icon')
      expect(app).not.toHaveProperty('readmeUrl')
      expect(app.screenshots).toEqual(full.screenshots)
      expect(app.size).toBe(15234)
    })

    it('drops screenshots with a non-https entry, or more than 8', () => {
      const bad = apps({ schema: 1, apps: [entry({ ...full, screenshots: [full.screenshots[0], 'javascript:alert(1)'] })] })[0]
      expect(bad).not.toHaveProperty('screenshots')
      const many = Array.from({ length: 9 }, (_, i) => `https://vsuite.tech/s${i}.png`)
      const tooMany = apps({ schema: 1, apps: [entry({ ...full, screenshots: many })] })[0]
      expect(tooMany).not.toHaveProperty('screenshots')
      const eight = apps({ schema: 1, apps: [entry({ ...full, screenshots: many.slice(0, 8) })] })[0]
      expect(eight.screenshots).toHaveLength(8)
    })

    it('drops a bad size or publishedAt alone', () => {
      for (const size of [-1, 1.5, '12', null]) {
        const [app] = apps({ schema: 1, apps: [entry({ ...full, size })] })
        expect(app).not.toHaveProperty('size')
        expect(app.publishedAt).toBe(full.publishedAt)
      }
      const [app] = apps({ schema: 1, apps: [entry({ ...full, publishedAt: 'last tuesday' })] })
      expect(app).not.toHaveProperty('publishedAt')
      expect(app.size).toBe(15234)
    })

    it('keeps valid agentTools and drops bad tools one by one', () => {
      const [a] = apps({ schema: 1, apps: [entry({ agentTools: [
        { name: 'web_search', description: 'Search the web.' },
        { name: 'Bad Name', description: 'x' },
        { name: 'no_desc', description: '  ' },
        { name: 'web_search', description: 'duplicate' },
        'junk',
      ] })] })
      expect(a.agentTools).toEqual([{ name: 'web_search', description: 'Search the web.' }])
    })

    it('leaves agentTools off when missing, not a list, or empty after validation', () => {
      expect(apps({ schema: 1, apps: [entry()] })[0].agentTools).toBeUndefined()
      expect(apps({ schema: 1, apps: [entry({ agentTools: 'x' })] })[0].agentTools).toBeUndefined()
      expect(apps({ schema: 1, apps: [entry({ agentTools: [{ name: '1', description: 'd' }] })] })[0].agentTools).toBeUndefined()
    })

    it('caps agentTools at 32', () => {
      const many = Array.from({ length: 40 }, (_, i) => ({ name: `t${i}`, description: 'd' }))
      expect(apps({ schema: 1, apps: [entry({ agentTools: many })] })[0].agentTools).toHaveLength(32)
    })

    it('accepts size 0', () => {
      expect(apps({ schema: 1, apps: [entry({ size: 0 })] })[0].size).toBe(0)
    })
  })
})
