import { describe, it, expect } from 'vitest'
import { extractVersionSection } from '../changelog'

const CHANGELOG = `# vIDE

## v0.1.2 (2026-08-10)
- Improved autocomplete logic and ui
- Implement graphiphy to reduce claude token usage aswell as speed up usage


## v0.1.1 (2026-08-09)
- Implemented quick repo change with Control + R
- Implemented notification system to show help messages and update notifications
- Added image and markdown viewers, fixed tree sync, dimmed ignored files


## v0.1.0 (2026-08-09)
- Switch distribution to curl-install script (zip/tar.gz instead of dmg/deb)`

describe('extractVersionSection', () => {
  it('extracts the section for the given version, heading through its bullets', () => {
    const section = extractVersionSection(CHANGELOG, '0.1.1')
    expect(section).toBe(
      '## v0.1.1 (2026-08-09)\n' +
      '- Implemented quick repo change with Control + R\n' +
      '- Implemented notification system to show help messages and update notifications\n' +
      '- Added image and markdown viewers, fixed tree sync, dimmed ignored files'
    )
  })

  it('extracts the newest version section correctly', () => {
    const section = extractVersionSection(CHANGELOG, '0.1.2')
    expect(section).toContain('## v0.1.2 (2026-08-10)')
    expect(section).toContain('Improved autocomplete logic and ui')
    expect(section).not.toContain('v0.1.1')
  })

  it('extracts the last (oldest) section through to end of file', () => {
    const section = extractVersionSection(CHANGELOG, '0.1.0')
    expect(section).toBe('## v0.1.0 (2026-08-09)\n- Switch distribution to curl-install script (zip/tar.gz instead of dmg/deb)')
  })

  it('returns null when the version has no matching section', () => {
    expect(extractVersionSection(CHANGELOG, '9.9.9')).toBeNull()
  })
})
