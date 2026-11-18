# Changelog severity rules

Every version section in `CHANGELOG.md` is one of three severities:
**normal**, **urgent** or **critical**. The severity decides how hard vIDE
pushes people to install that version, so pick it on purpose every time you
write a section.

## The marker

Normal needs nothing. Urgent and critical need one line directly under the
version heading:

```markdown
## v0.3.6 (2026-11-19)
<!-- vide-update: severity=urgent -->
- …
```

```markdown
## v0.3.6 (2026-11-19)
<!-- vide-update: severity=critical -->
- …
```

Format rules:

- The marker is on its own line, right under the `## v…` heading, before
  any entries.
- Exactly `severity=urgent` or `severity=critical`. Anything else (a typo,
  `security`, `high`) is read as normal.
- One marker per version. Never put a marker under an older version's
  heading after it has been released; add it to the new version instead.
- The marker never shows in the app (Update page, Settings > About drop it),
  so the entries still need to say what was fixed.

## Normal

**When:** features, bug fixes, UI changes, refactors, dependency bumps with
no security impact.

**What users see:** the update stays pinned above the notification bell
until they click **Update** or **×**. **×** hides it until the next launch;
it stays listed in the bell.

```markdown
## v0.3.7 (2026-11-24)
- **Gauges view**: …
- Fixed the terminal losing focus after closing a palette
```

## Urgent

**When:** any security fix, including:

- a dependency bumped because of a CVE or security advisory, even if vIDE
  probably isn't exploitable through it;
- hardening of anything that listens on the network (Mobile Display,
  MCP servers), handles credentials or tokens, or runs commands;
- fixing a way for a page, repo, or Store app to get more access than it
  should.

**When unsure between normal and urgent, choose urgent.**

**What users see:** a red pinned row and a red bell. There's no **×**, and
"Dismiss all" skips it. **Snooze** hides it for an hour, then it comes back
and the bell rings again. Every relaunch brings it back straight away.

**Entries:** start with a **Security** entry that names what was fixed, so
people can see why they're being pushed. Name the CVE if there is one.

```markdown
## v0.3.6 (2026-11-19)
<!-- vide-update: severity=urgent -->
- **Security**: updated undici to 8.0.2 to fix CVE-2026-XXXXX
- **Gauges view**: …
```

## Critical

**When:** only when one of these is true:

- the vulnerability is being actively exploited;
- it's trivially exploitable in a default vIDE install, with no unusual
  setup (for example, anyone on the same network can run commands).

Critical stops people from working until they update, so it should be rare.
If it isn't clearly one of the two cases above, it's urgent.

**What users see:** the same as urgent for the rest of their current
session. On the next launch, vIDE shows an **Update required** screen in
place of the app until they update.

**Entries:** same as urgent, a **Security** entry first. Keep the release
small: ship the fix on its own rather than bundling it with features, so
the forced update is as safe as possible.

```markdown
## v0.3.8 (2026-11-26)
<!-- vide-update: severity=critical -->
- **Security**: fixed Mobile Display accepting commands without pairing
```

## Things to know

- **Skipped versions count.** vIDE uses the highest severity among every
  version newer than the installed one. If 0.3.6 is urgent and 0.3.7 is
  normal, someone on 0.3.5 still sees an urgent update. A later normal
  release doesn't need to repeat the marker.
- **Critical can't be taken back.** Once a machine has seen a critical
  release, it shows the Update required screen on every launch until it's
  on that version or newer, even if the marker is removed later.
- **Fixing a mistake.** If a release went out with the wrong severity, edit
  its GitHub release notes to add or correct the marker (machines check
  hourly), and fix `CHANGELOG.md` to match. The release notes are copied
  from the CHANGELOG section when the tag is pushed
  (`.github/workflows/release.yml`), and the app reads the severity from
  the release notes (`electron/updateChecker.ts`).
