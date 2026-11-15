import { describe, it, expect } from 'vitest'
import { parseManifest } from '../appManifest'

const example = {
  id: 'docker',
  name: 'Docker',
  version: '1.1.0',
  apiVersion: 1,
  minVide: '0.4.0',
  renderer: 'renderer.js',
  main: 'main.js',
  icon: 'assets/icon.svg',
  style: 'style.css',
  contributes: {
    sidebarPanel: { title: 'Docker' },
    settingsPage: { title: 'Docker' },
    tabKinds: ['logs'],
    commands: true,
    notifications: true,
    agentTools: false
  }
}

describe('parseManifest', () => {
  it('parses the spec example', () => {
    expect(parseManifest(example)).toEqual(example)
  })

  it('defaults contributes to {}', () => {
    const { contributes: _c, main: _m, icon: _i, style: _s, ...rest } = example
    expect(parseManifest(rest)).toEqual({ ...rest, contributes: {} })
  })

  it.each([
    ['bad id', { id: 'Docker' }],
    ['bad version', { version: '1.0' }],
    ['bad apiVersion', { apiVersion: 0 }],
    ['bad apiVersion', { apiVersion: 1.5 }],
    ['bad apiVersion', { apiVersion: '1' }],
    ['bad renderer', { renderer: undefined }],
    ['bad renderer', { renderer: '../renderer.js' }],
    ['bad renderer', { renderer: '/renderer.js' }],
    ['bad main', { main: 'a/../../main.js' }],
    ['bad main', { main: '/main.js' }],
    ['bad icon', { icon: '../icon.svg' }],
    ['bad icon', { icon: '/icon.svg' }],
    ['bad style', { style: '../style.css' }]
  ])('rejects %s', (reason, patch) => {
    expect(parseManifest({ ...example, ...patch })).toBe(reason)
  })

  it('rejects non-objects', () => {
    expect(typeof parseManifest(null)).toBe('string')
    expect(typeof parseManifest([])).toBe('string')
  })

  describe('page fields', () => {
    const base = { id: 'docker', name: 'Docker', version: '1.0.0', apiVersion: 1, minVide: '0.4.0', renderer: 'renderer.js' }

    it('keeps description and screenshots', () => {
      const m = parseManifest({ ...base, description: 'Containers.', screenshots: ['assets/a.png', 'assets/b.png'] })
      expect(m).toMatchObject({ description: 'Containers.', screenshots: ['assets/a.png', 'assets/b.png'] })
    })

    it('leaves them off when absent', () => {
      const m = parseManifest(base)
      expect(m).not.toHaveProperty('description')
      expect(m).not.toHaveProperty('screenshots')
    })

    it('drops unsafe or too many screenshots, and a non-string description, without failing the manifest', () => {
      for (const screenshots of [['../x.png'], ['/abs.png'], ['a\\b.png'], [''], 'a.png', Array.from({ length: 9 }, (_, i) => `s${i}.png`)]) {
        const m = parseManifest({ ...base, description: 5, screenshots })
        expect(typeof m).toBe('object')
        expect(m).not.toHaveProperty('screenshots')
        expect(m).not.toHaveProperty('description')
      }
    })

    it('accepts exactly 8 screenshots', () => {
      const shots = Array.from({ length: 8 }, (_, i) => `s${i}.png`)
      expect(parseManifest({ ...base, screenshots: shots })).toMatchObject({ screenshots: shots })
    })
  })
})
