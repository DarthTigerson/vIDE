import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resetChannelsForTest, dispatch } from '../dispatch'

vi.mock('../../fsOps', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../fsOps')>()),
  listAllFiles: vi.fn(async (root: string) => [`${root}/a.ts`]),
  writeFile: vi.fn(async (path: string, content: string) => ({ path, content })),
  renamePath: vi.fn(async (from: string, to: string) => ({ from, to })),
  copyInto: vi.fn(async (source: string, destDir: string) => ({ source, destDir, op: 'copy' })),
  moveInto: vi.fn(async (source: string, destDir: string) => ({ source, destDir, op: 'move' })),
  searchText: vi.fn(async (root: string, query: string, caseSensitive: boolean) => [
    `${root}:${query}:${caseSensitive}`,
  ]),
}))

import { registerFsRelayChannels } from '../channels/fsChannels'

describe('fsChannels', () => {
  beforeEach(() => {
    resetChannelsForTest()
    registerFsRelayChannels()
  })

  it('maps fs:listAllFiles to listAllFiles', async () => {
    const res = await dispatch({ type: 'invoke', id: '1', method: 'fs:listAllFiles', args: ['/root'] })
    expect(res).toEqual({ type: 'response', id: '1', result: ['/root/a.ts'] })
  })

  it('passes fs:writeFile args through in order (path, content)', async () => {
    const res = await dispatch({
      type: 'invoke',
      id: '2',
      method: 'fs:writeFile',
      args: ['/f.txt', 'hello world'],
    })
    expect(res).toEqual({
      type: 'response',
      id: '2',
      result: { path: '/f.txt', content: 'hello world' },
    })
  })

  it('passes fs:rename args through in order (from, to)', async () => {
    const res = await dispatch({ type: 'invoke', id: '3', method: 'fs:rename', args: ['/a.txt', '/b.txt'] })
    expect(res).toEqual({
      type: 'response',
      id: '3',
      result: { from: '/a.txt', to: '/b.txt' },
    })
  })

  it('passes fs:searchText args through in order (root, query, caseSensitive)', async () => {
    const res = await dispatch({
      type: 'invoke',
      id: '4',
      method: 'fs:searchText',
      args: ['/root', 'needle', true],
    })
    expect(res).toEqual({ type: 'response', id: '4', result: ['/root:needle:true'] })
  })

  it('passes fs:copyInto and fs:moveInto args through in order (source, destDir)', async () => {
    const copied = await dispatch({ type: 'invoke', id: '5', method: 'fs:copyInto', args: ['/a.txt', '/dest'] })
    expect(copied).toEqual({ type: 'response', id: '5', result: { source: '/a.txt', destDir: '/dest', op: 'copy' } })
    const moved = await dispatch({ type: 'invoke', id: '6', method: 'fs:moveInto', args: ['/a.txt', '/dest'] })
    expect(moved).toEqual({ type: 'response', id: '6', result: { source: '/a.txt', destDir: '/dest', op: 'move' } })
  })
})
