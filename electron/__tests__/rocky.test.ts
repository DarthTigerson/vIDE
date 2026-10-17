import { describe, it, expect } from 'vitest'
import { ROCKY_AGENTS, ROCKY_PROMPT, ROCKY_SETTINGS, rockySpawnEnv } from '../rocky'

describe('Rocky Code preset', () => {
  it('defines a Haiku scout and a Sonnet worker', () => {
    expect(ROCKY_AGENTS.scout).toMatchObject({ model: 'haiku', effort: 'low' })
    expect(ROCKY_AGENTS.worker).toMatchObject({ model: 'sonnet', effort: 'medium' })
  })

  it('keeps the scout read-only', () => {
    expect(ROCKY_AGENTS.scout.tools).toEqual(['Read', 'Grep', 'Glob'])
  })

  it('round-trips the agents through the spawn env as JSON', () => {
    expect(JSON.parse(rockySpawnEnv().VIDE_ROCKY_AGENTS)).toEqual(ROCKY_AGENTS)
    expect(rockySpawnEnv().VIDE_ROCKY_PROMPT).toBe(ROCKY_PROMPT)
  })

  it('replaces the spinner verbs and tips, with no apostrophe to break the single-quoted --settings', () => {
    expect(ROCKY_SETTINGS.spinnerVerbs.mode).toBe('replace')
    expect(ROCKY_SETTINGS.spinnerTipsOverride.excludeDefault).toBe(true)
    expect(JSON.stringify(ROCKY_SETTINGS)).not.toContain("'")
  })

  it('keeps code and helper briefs out of the Rocky voice', () => {
    expect(ROCKY_PROMPT).toMatch(/Normal English, no Rocky voice, in: code/)
    expect(ROCKY_PROMPT).toMatch(/Delegate only to "scout" and "worker"/)
  })
})
