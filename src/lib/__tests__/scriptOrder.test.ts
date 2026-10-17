import { describe, it, expect } from 'vitest'
import { orderScriptsForProject } from '../scriptOrder'

const list = [
  { id: '1', title: 'zeta' },
  { id: '2', title: 'Alpha' },
  { id: '3', title: 'beta' },
]

describe('orderScriptsForProject', () => {
  it('puts scripts tagged with the project first, both groups by title', () => {
    const { tagged, others } = orderScriptsForProject(list, { '1': ['/p'], '3': ['/p', '/q'] }, '/p')
    expect(tagged.map((s) => s.id)).toEqual(['3', '1'])
    expect(others.map((s) => s.id)).toEqual(['2'])
  })

  it('puts everything in others when there is no project', () => {
    const { tagged, others } = orderScriptsForProject(list, { '1': ['/p'] }, null)
    expect(tagged).toEqual([])
    expect(others.map((s) => s.id)).toEqual(['2', '3', '1'])
  })
})
