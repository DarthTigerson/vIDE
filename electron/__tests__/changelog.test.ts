import { describe, it, expect } from 'vitest'
import { parseChangelog, extractVersionSection } from '../changelog'

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

describe('severity marker', () => {
  const withMarker = '# vIDE\n## v0.3.6 (2026-11-19)\n<!-- vide-update: severity=urgent -->\n- Fixed a vulnerable dependency\n'

  it('is left out of an extracted section', () => {
    expect(extractVersionSection(withMarker, '0.3.6')).toBe('## v0.3.6 (2026-11-19)\n- Fixed a vulnerable dependency')
  })

  it('is left out of parsed release bodies', () => {
    expect(parseChangelog(withMarker)[0].body).toBe('- Fixed a vulnerable dependency')
  })
})

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

describe('parseChangelog', () => {
  const md = '# vIDE\n## v0.2.20 (2026-10-08)\n- **Alarms**: new\n\n**Bug fixes**\n- Fixed it\n\n\n## v0.2.19 (2026-09-29)\n- Old thing\n\n## v0.1.0\n- First\n'

  it('lists every release newest first, with its date and notes but not the heading', () => {
    expect(parseChangelog(md)).toEqual([
      { version: '0.2.20', date: '2026-10-08', body: '- **Alarms**: new\n\n**Bug fixes**\n- Fixed it' },
      { version: '0.2.19', date: '2026-09-29', body: '- Old thing' },
      { version: '0.1.0', date: null, body: '- First' },
    ])
  })

  it('ignores anything before the first release heading', () => {
    expect(parseChangelog('# vIDE\nintro text\n')).toEqual([])
  })
})

