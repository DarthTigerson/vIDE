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
})
