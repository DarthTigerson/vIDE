import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { WordChecker } from '../dictionary'
import { AliasTable, Masker } from '../masker'
import { DEFAULT_VCLOAK_CONFIG } from '../types'

function wordList(words: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'vcloak-words-'))
  const p = join(dir, 'words')
  writeFileSync(p, words.join('\n') + '\n')
  return p
}

describe('vCloak word checker', () => {
  const words = new WordChecker(wordList(['core', 'tool', 'share', 'forum', 'build', 'Harbor']))

  it('knows listed words, any case', () => {
    expect(words.isWord('core')).toBe(true)
    expect(words.isWord('Forum')).toBe(true)
    expect(words.isWord('harbor')).toBe(true)
  })

  it('strips common endings', () => {
    expect(words.isWord('tools')).toBe(true)
    expect(words.isWord('shared')).toBe(true)
    expect(words.isWord('building')).toBe(true)
  })

  it('knows common tech words the system list lacks', () => {
    expect(words.isWord('demo')).toBe(true)
    expect(words.isWord('kubernetes')).toBe(true)
    expect(words.isWord('auth')).toBe(true)
  })

  it('does not know made-up project names', () => {
    expect(words.isWord('megazord')).toBe(false)
    expect(words.isWord('Quuxify')).toBe(false)
  })

  it('treats every name as a word when the list is missing', () => {
    const none = new WordChecker('/nonexistent/vcloak/words')
    expect(none.isWord('megazord')).toBe(true)
  })
})

describe('vCloak plain one-word names', () => {
  const WS = '/Users/you/work/space'
  const words = new WordChecker(wordList(['core', 'forum', 'tool']))
  function make(hidePlainNames: boolean) {
    return new Masker(new AliasTable(Buffer.alloc(32, 4)), {
      config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, hidePlainNames, roots: [{ path: 'acme-corp', host: 'gitlab' }] },
      workspaces: [{ root: WS, repos: [
        { rel: 'megazord/forum', remote: 'acme-corp/megazord/forum' },
        { rel: 'core/tools', remote: 'acme-corp/core/tools' },
      ] }],
      homeDir: '/Users/you', username: 'you',
      isWord: (n) => words.isWord(n),
    })
  }

  it('hides a made-up name alone with a two-word alias and restores it', () => {
    const masker = make(true)
    const s = 'the megazord service talks to the forum'
    const out = masker.maskText(s)
    expect(out).not.toContain('megazord')
    expect(out).toMatch(/^the [a-z]+[a-z]+ service talks to the forum$/)
    const alias = out.split(' ')[1]
    expect(words.isWord(alias)).toBe(false)
    expect(masker.maskText(out)).toBe(out)
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('uses the same alias in paths and alone', () => {
    const masker = make(true)
    const inPath = masker.maskText('acme-corp/megazord/forum/README.md').split('/')[1]
    expect(masker.maskText('megazord')).toBe(inPath)
  })

  it('leaves ordinary words alone', () => {
    const masker = make(true)
    expect(masker.maskText('core tools and forum')).toBe('core tools and forum')
  })

  it('keeps the old behaviour when switched off', () => {
    const masker = make(false)
    expect(masker.maskText('the megazord service')).toBe('the megazord service')
  })
})
