import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useGraphifyStore } from '../graphifyStore'
import type { GraphifyGraph } from '@/types/graphify'

const sampleGraph: GraphifyGraph = {
  directed: false,
  multigraph: false,
  hyperedges: [],
  nodes: [
    { id: 'src_main', label: 'main.py', file_type: 'code', source_file: 'src/main.py', source_location: 'L1', _origin: 'ast', community: 0, community_name: 'main.py', norm_label: 'main.py' },
    { id: 'src_math_utils', label: 'math_utils.py', file_type: 'code', source_file: 'src/math_utils.py', source_location: 'L1', _origin: 'ast', community: 0, community_name: 'main.py', norm_label: 'math_utils.py' },
  ],
  links: [
    { source: 'src_main', target: 'src_math_utils', relation: 'imports_from', context: 'import', confidence: 'EXTRACTED', confidence_score: 1, source_file: 'src/main.py', source_location: 'L1', weight: 1, _origin: 'ast' },
  ],
}

let dataHandler: ((id: string, data: string) => void) | null = null
let exitHandler: ((id: string, code: number) => void) | null = null
let onGraphifyDataCleanup: ReturnType<typeof vi.fn>
let onGraphifyExitCleanup: ReturnType<typeof vi.fn>

vi.stubGlobal('window', {
  api: {
    graphifyIsAvailable: vi.fn().mockResolvedValue(true),
    graphifyRun: vi.fn().mockResolvedValue(undefined),
    graphifyReadGraph: vi.fn().mockResolvedValue(sampleGraph),
    graphifyInstallClaudeSkill: vi.fn().mockResolvedValue({ ok: true, output: 'skill installed' }),
    graphifyNeedsGitignore: vi.fn().mockResolvedValue(false),
    graphifyNeedsClaudeSkill: vi.fn().mockResolvedValue(false),
    graphifyAddToGitignore: vi.fn().mockResolvedValue({ ok: true, output: '' }),
    onGraphifyData: vi.fn((cb) => {
      dataHandler = cb
      return onGraphifyDataCleanup
    }),
    onGraphifyExit: vi.fn((cb) => {
      exitHandler = cb
      return onGraphifyExitCleanup
    }),
  },
})
vi.stubGlobal('crypto', { randomUUID: () => 'fixed-id' })

describe('graphifyStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dataHandler = null
    exitHandler = null
    onGraphifyDataCleanup = vi.fn()
    onGraphifyExitCleanup = vi.fn()
    useGraphifyStore.setState({
      available: null, checking: false, running: false, progress: '', error: null,
      graph: null, loadingGraph: false, installingSkill: null,
      gitignorePrompts: {}, claudeSkillPrompts: {},
    })
  })

  it('checkAvailable sets available from window.api', async () => {
    await useGraphifyStore.getState().checkAvailable()
    expect(useGraphifyStore.getState().available).toBe(true)
  })

  it('run accumulates streamed progress and loads the graph on a clean exit', async () => {
    const runPromise = useGraphifyStore.getState().run('/project')
    expect(useGraphifyStore.getState().running).toBe(true)

    dataHandler?.('fixed-id', 'building graph...')
    expect(useGraphifyStore.getState().progress).toBe('building graph...')

    exitHandler?.('fixed-id', 0)
    await runPromise
    await Promise.resolve()

    expect(useGraphifyStore.getState().running).toBe(false)
    expect(window.api.graphifyReadGraph).toHaveBeenCalledWith('/project')
    expect(useGraphifyStore.getState().graph).toEqual(sampleGraph)
    expect(window.api.graphifyNeedsGitignore).toHaveBeenCalledWith('/project')
    expect(window.api.graphifyNeedsClaudeSkill).toHaveBeenCalledWith('/project')
  })

  it('run sets an error and does not load the graph on a non-zero exit', async () => {
    const runPromise = useGraphifyStore.getState().run('/project')
    exitHandler?.('fixed-id', 1)
    await runPromise

    expect(useGraphifyStore.getState().running).toBe(false)
    expect(useGraphifyStore.getState().error).toContain('1')
    expect(window.api.graphifyReadGraph).not.toHaveBeenCalled()
  })

  it('run folds the tail of the accumulated progress into the error on a non-zero exit', async () => {
    const runPromise = useGraphifyStore.getState().run('/project')

    dataHandler?.('fixed-id', 'Traceback (most recent call last):\n')
    dataHandler?.('fixed-id', '  File "graphify/cli.py", line 42\nRuntimeError: something broke\n')

    exitHandler?.('fixed-id', 1)
    await runPromise

    const { error } = useGraphifyStore.getState()
    expect(error).toContain('RuntimeError: something broke')
    expect(error).toContain('code 1')
  })

  it('run caps the error tail at the last ERROR_TAIL_CHARS (2000) characters of progress', async () => {
    const runPromise = useGraphifyStore.getState().run('/project')

    const longChunk = 'x'.repeat(3000) + 'END_MARKER'
    dataHandler?.('fixed-id', longChunk)

    exitHandler?.('fixed-id', 1)
    await runPromise

    const { error } = useGraphifyStore.getState()
    expect(error).toContain('END_MARKER')
    // 2000-char tail + the "graphify exited with code 1:\n" prefix — the raw
    // 3000-char run of 'x' must not appear in full.
    expect(error?.length).toBeLessThan(longChunk.length)
  })

  it('a second run while one is in flight is a no-op', async () => {
    const runPromise1 = useGraphifyStore.getState().run('/project')
    const stateAfterFirst = useGraphifyStore.getState()

    void useGraphifyStore.getState().run('/project')
    const stateAfterSecond = useGraphifyStore.getState()

    expect(window.api.graphifyRun).toHaveBeenCalledTimes(1)
    // Verify second call didn't reset progress, error, or double-subscribe
    expect(stateAfterSecond.progress).toBe(stateAfterFirst.progress)
    expect(stateAfterSecond.error).toBe(stateAfterFirst.error)
    expect(window.api.onGraphifyData).toHaveBeenCalledTimes(1)
    expect(window.api.onGraphifyExit).toHaveBeenCalledTimes(1)
  })

  it('run cleans up and sets error on graphifyRun rejection', async () => {
    ;(window.api.graphifyRun as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('process failed'))
    const runPromise = useGraphifyStore.getState().run('/project')

    await runPromise

    expect(useGraphifyStore.getState().running).toBe(false)
    expect(useGraphifyStore.getState().error).toContain('process failed')
    expect(onGraphifyDataCleanup).toHaveBeenCalled()
    expect(onGraphifyExitCleanup).toHaveBeenCalled()
    expect(window.api.graphifyReadGraph).not.toHaveBeenCalled()
  })

  it('checkAvailable sets checking to false and available to false on error (not null, to avoid an infinite retry loop)', async () => {
    ;(window.api.graphifyIsAvailable as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('unavailable'))
    await useGraphifyStore.getState().checkAvailable()

    expect(useGraphifyStore.getState().checking).toBe(false)
    expect(useGraphifyStore.getState().available).toBe(false)
  })

  it('loadGraph clears graph to null on failure', async () => {
    ;(window.api.graphifyReadGraph as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('missing'))
    await useGraphifyStore.getState().loadGraph('/project')

    expect(useGraphifyStore.getState().graph).toBeNull()
    expect(useGraphifyStore.getState().loadingGraph).toBe(false)
  })

  it('installClaudeSkill installs, marks the repo while in flight, and clears its prompt', async () => {
    useGraphifyStore.setState({ claudeSkillPrompts: { '/project': null } })
    const installPromise = useGraphifyStore.getState().installClaudeSkill('/project')
    expect(useGraphifyStore.getState().installingSkill).toBe('/project')

    await installPromise

    expect(window.api.graphifyInstallClaudeSkill).toHaveBeenCalledWith('/project')
    expect(useGraphifyStore.getState().installingSkill).toBeNull()
    expect(useGraphifyStore.getState().claudeSkillPrompts).toEqual({})
  })

  it('installClaudeSkill keeps the prompt with the error rather than throwing when the IPC call rejects', async () => {
    ;(window.api.graphifyInstallClaudeSkill as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('spawn failed'))
    useGraphifyStore.setState({ claudeSkillPrompts: { '/project': null } })

    await useGraphifyStore.getState().installClaudeSkill('/project')

    expect(useGraphifyStore.getState().installingSkill).toBeNull()
    expect(useGraphifyStore.getState().claudeSkillPrompts).toEqual({ '/project': 'spawn failed' })
  })

  it('checkClaudeSkill raises a prompt while the skill is missing and clears it once installed', async () => {
    const needs = window.api.graphifyNeedsClaudeSkill as ReturnType<typeof vi.fn>
    needs.mockResolvedValueOnce(true)
    await useGraphifyStore.getState().checkClaudeSkill('/project')
    expect(useGraphifyStore.getState().claudeSkillPrompts).toEqual({ '/project': null })

    needs.mockResolvedValueOnce(false)
    await useGraphifyStore.getState().checkClaudeSkill('/project')
    expect(useGraphifyStore.getState().claudeSkillPrompts).toEqual({})
  })

  it('checkGitignore raises a prompt for a repo whose graphify-out needs ignoring, and clears it once it does not', async () => {
    const needs = window.api.graphifyNeedsGitignore as ReturnType<typeof vi.fn>
    needs.mockResolvedValueOnce(true)
    await useGraphifyStore.getState().checkGitignore('/project')
    expect(useGraphifyStore.getState().gitignorePrompts).toEqual({ '/project': null })

    needs.mockResolvedValueOnce(false)
    await useGraphifyStore.getState().checkGitignore('/project')
    expect(useGraphifyStore.getState().gitignorePrompts).toEqual({})
  })

  it('addToGitignore adds the entry and clears the prompt', async () => {
    useGraphifyStore.setState({ gitignorePrompts: { '/project': null } })
    await useGraphifyStore.getState().addToGitignore('/project')
    expect(window.api.graphifyAddToGitignore).toHaveBeenCalledWith('/project')
    expect(useGraphifyStore.getState().gitignorePrompts).toEqual({})
  })

  it('addToGitignore keeps the prompt with the error when adding fails', async () => {
    ;(window.api.graphifyAddToGitignore as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, output: 'EACCES' })
    useGraphifyStore.setState({ gitignorePrompts: { '/project': null } })
    await useGraphifyStore.getState().addToGitignore('/project')
    expect(useGraphifyStore.getState().gitignorePrompts).toEqual({ '/project': 'EACCES' })
  })
})
