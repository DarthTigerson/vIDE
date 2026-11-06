import { describe, it, expect } from 'vitest'
import { AliasTable, Masker } from '../masker'
import { DEFAULT_VCLOAK_CONFIG } from '../types'

const H = '/Users/you/Documents/Projects'
const WS = '/Users/you/work/AcmeApps'

function make(listDir: (p: string) => string[] = () => []) {
  const table = new AliasTable(Buffer.alloc(32, 8))
  const masker = new Masker(table, {
    config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, roots: [{ path: 'acme-corp', host: 'gitlab' }], hiddenFolders: [H], hiddenDepth: 'one' },
    workspaces: [{ root: WS, repos: [{ rel: 'core/sports-api', remote: 'acme-corp/core/sports-api' }] }],
    homeDir: '/Users/you', username: 'you',
    listDir,
    exists: (p) => p === `${H}/MegaTool` || p === H,
    isDir: (p) => p === `${H}/MegaTool` || p === H,
  })
  return { table, masker }
}
const long = (s: string) => `${s} `.padEnd(400, '.')

describe('vCloak lone and path names share one alias', () => {
  it('hides a known name after an unknown prefix, also when the history is resent', () => {
    const { masker } = make()
    masker.maskText(`${H}/MegaTool/src/a.ts`)
    const s = 'ls "$WS"/sports-api/base and "$H"/MegaTool/electron'
    const out = masker.maskText(s)
    expect(out).not.toMatch(/sports-api|MegaTool/)
    expect(masker.unmaskText(out)).toBe(s)
    // The restored reply goes back out on the next turn: it must be masked again
    expect(masker.maskText(masker.unmaskText(out))).toBe(out)
  })

  it('uses the same alias in path form and lone form, and restores either alone', () => {
    const { masker } = make()
    const pathAlias = masker.maskText(`${H}/MegaTool/x.md`).split('/')[5]
    const loneAlias = masker.maskText('MegaTool')
    expect(loneAlias).toBe(pathAlias)
    expect(masker.unmaskText(`git -C ${pathAlias} status`)).toBe('git -C MegaTool status')
    const repoPath = masker.maskText('acme-corp/core/sports-api/README.md').split('/')
    expect(masker.maskText('sports-api')).toBe(repoPath[2])
  })

  it('learns hidden level-1 names from paths when the folder cannot be listed, and refreshes the cache', () => {
    const { masker } = make(() => [])
    const lone = long('Working on MegaTool today')
    expect(masker.maskText(lone)).toContain('MegaTool')
    masker.maskText(`${H}/MegaTool/src/a.ts`)
    expect(masker.maskText(lone)).not.toContain('MegaTool')
  })

  it('hides the workspace folder name in paths and restores it', () => {
    const { masker } = make()
    const s = `cd ${WS}/core/sports-api && ls ${WS}`
    const out = masker.maskText(s)
    expect(out).not.toMatch(/AcmeApps|sports-api/)
    expect(masker.maskText(out)).toBe(out)
    expect(masker.unmaskText(out)).toBe(s)
    expect(masker.maskText('AcmeApps')).toBe(out.split(' ')[1].split('/')[4])
  })

  it('gives a mirrored local folder the same aliases as its repo path', () => {
    const { masker } = make()
    const local = masker.maskText(`${WS}/core/sports-api/x`).split('/').slice(5, 7)
    const remote = masker.maskText('acme-corp/core/sports-api/x').split('/').slice(1, 3)
    expect(local).toEqual(remote)
    expect(masker.maskText('sports-api')).toBe(remote[1])
  })

  it('hides the workspace name inside Claude dash-encoded folders, username too', () => {
    const table = new AliasTable(Buffer.alloc(32, 8))
    const m = new Masker(table, {
      config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, maskUsername: true, roots: [{ path: 'acme-corp', host: 'gitlab' }] },
      workspaces: [{ root: '/Users/pjordan/work/AcmeApps', repos: [{ rel: 'core/sports-api', remote: 'acme-corp/core/sports-api' }] }],
      homeDir: '/Users/pjordan', username: 'pjordan',
    })
    const s = 'memory at /Users/pjordan/.claude/projects/-Users-pjordan-work-AcmeApps/memory/x.md'
    const out = m.maskText(s)
    expect(out).not.toMatch(/AcmeApps|pjordan/)
    expect(out).toContain('-Users-dev-work-')
    expect(m.maskText(out)).toBe(out)
    expect(m.unmaskText(out)).toBe(s)
  })

  it('learns hidden names from the whole request before masking any of it', () => {
    const { masker } = make(() => [])
    const body = { messages: [
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'MegaTool\nnotes' }] },
      { role: 'user', content: [{ type: 'text', text: `cd ${H}/MegaTool` }] },
    ] }
    const out = JSON.stringify(masker.maskBody(body))
    expect(out).not.toContain('MegaTool')
  })
})

describe('vCloak names learned part way through masking', () => {
  it('masks a name written alone before the path that teaches it, in one string', () => {
    const { masker } = make()
    const s = `Working on MegaTool today.\nOpen ${H}/MegaTool/README.md`
    const out = masker.maskText(s)
    expect(out).not.toContain('MegaTool')
    expect(masker.maskText(out)).toBe(out)
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('masks an earlier string again when a later string teaches the name', () => {
    const { masker } = make()
    // Bypass prelearn: it would catch this simple case on its own
    ;(masker as any).prelearn = () => {}
    const body = { messages: [{ content: 'MegaTool is the app' }, { content: `cd ${H}/MegaTool/src` }] }
    const out = masker.maskBody(body)
    expect(JSON.stringify(out)).not.toContain('MegaTool')
  })
})

describe('vCloak round 5 fixes', () => {
  it('hides the username and workspace name in a double-dash folder name', () => {
    const masker = new Masker(new AliasTable(Buffer.alloc(32, 8)), {
      config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, maskUsername: true, roots: [{ path: 'acme-corp', host: 'gitlab' }] },
      workspaces: [{ root: WS, repos: [{ rel: 'core/sports-api', remote: 'acme-corp/core/sports-api' }] }],
      homeDir: '/Users/you', username: 'you',
    })
    const s = `/Users/you/.claude/projects/-private-tmp-claude-501--Users-you-work-AcmeApps-abc/x.jsonl`
    const out = masker.maskText(s)
    expect(out).not.toMatch(/-you-|AcmeApps/)
    expect(out).toContain('--Users-dev-work-')
    expect(masker.maskText(out)).toBe(out)
    expect(masker.unmaskText(out)).toBe(s)
  })

  it('hides a dotted repo name alone, with the same alias as in its path', () => {
    const table = new AliasTable(Buffer.alloc(32, 8))
    const masker = new Masker(table, {
      config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, roots: [{ path: 'acme-corp', host: 'gitlab' }] },
      workspaces: [{ root: WS, repos: [{ rel: 'core/Auth.SRV', remote: 'acme-corp/core/Auth.SRV' }, { rel: 'legacy/jsonupdater.cli', remote: 'acme-corp/core/jsonupdater.cli' }] }],
      homeDir: '/Users/you', username: 'you',
    })
    for (const name of ['Auth.SRV', 'jsonupdater.cli']) {
      const alone = masker.maskText(`see ${name} now`)
      expect(alone).not.toContain(name)
      expect(masker.unmaskText(alone)).toBe(`see ${name} now`)
    }
    // Local folder layout differs from the repo path: still one alias
    const path = masker.maskText(`${WS}/legacy/jsonupdater.cli/README.md`).split('/').slice(-2, -1)[0]
    expect(masker.maskText('jsonupdater.cli')).toBe(path)
  })

  it('gives a name that is both a GitHub root and a hidden-folder name one alias', () => {
    const table = new AliasTable(Buffer.alloc(32, 8))
    const masker = new Masker(table, {
      config: { ...DEFAULT_VCLOAK_CONFIG, enabled: true, maskRoot: true, roots: [{ path: 'acme-corp', host: 'gitlab' }, { path: 'MegaTool', host: 'github' }], hiddenFolders: [H] },
      workspaces: [], homeDir: '/Users/you', username: 'you',
      listDir: (p) => (p === H ? ['MegaTool'] : []),
      exists: (p) => p === H || p === `${H}/MegaTool`,
      isDir: (p) => p === H || p === `${H}/MegaTool`,
    })
    const inPath = masker.maskText(`${H}/MegaTool/src/a.ts`).split('/')[5]
    expect(masker.maskText('MegaTool')).toBe(inPath)
    expect(masker.maskText('https://github.com/MegaTool/x')).not.toContain('MegaTool')
  })
})
