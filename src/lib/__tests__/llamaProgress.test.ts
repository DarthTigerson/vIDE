import { describe, it, expect } from 'vitest'
import { llamaPhase, llamaPhaseCode } from '../llamaProgress'

const progress = (p: number) =>
  `slot update_slots: id  0 | task 1260 | prompt processing progress, n_tokens = 50688, batch.n_tokens = 1024, progress = ${p}\n`

describe('llamaPhase', () => {
  it('reads the newest prompt progress', () => {
    expect(llamaPhase(progress(0.25) + progress(0.51))).toEqual({ kind: 'reading', progress: 0.51 })
  })

  it('starts a new task at 0', () => {
    const log = 'srv  update_slots: all slots are idle\nslot launch_slot_: id  0 | task 1261 | processing task\n'
    expect(llamaPhase(log)).toEqual({ kind: 'reading', progress: 0 })
  })

  it('reports prompt done once the prompt is read', () => {
    expect(llamaPhase(progress(0.9) + 'slot update_slots: id  0 | task 1260 | prompt done, n_tokens = 99400\n')).toEqual({ kind: 'promptDone' })
  })

  it('reports idle after the request ends', () => {
    expect(llamaPhase(progress(1) + 'srv  update_slots: all slots are idle\n')).toEqual({ kind: 'idle' })
  })

  it('knows nothing from a log without request lines', () => {
    expect(llamaPhase('main: server is listening on http://127.0.0.1:8080\n')).toBeNull()
    expect(llamaPhaseCode('')).toBe(-1)
  })

  it('encodes phases as one number', () => {
    expect(llamaPhaseCode(progress(0.4))).toBe(0.4)
    expect(llamaPhaseCode('prompt done\n')).toBe(2)
    expect(llamaPhaseCode('all slots are idle\n')).toBe(3)
  })
})
