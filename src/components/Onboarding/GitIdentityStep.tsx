import { useEffect, useState } from 'react'

export function GitIdentityStep() {
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [wasAlreadySet, setWasAlreadySet] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    window.api.onboardingGetGitIdentity().then((identity) => {
      setName(identity.name ?? '')
      setEmail(identity.email ?? '')
      setWasAlreadySet(!!identity.name && !!identity.email)
      setLoading(false)
    })
  }, [])

  const save = () => {
    window.api.onboardingSetGitIdentity(name.trim(), email.trim()).then(() => setSaved(true))
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-fg">Git identity</h2>
        <p className="text-xs text-fg-muted mt-0.5">
          vIDE is git-heavy — commits need a name and email set globally (<code className="text-fg-subtle">git config --global</code>).
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-fg-muted">Checking…</p>
      ) : (
        <>
          {wasAlreadySet && !saved && (
            <p className="text-xs text-green-500">✓ Already configured — edit below if you'd like to change it.</p>
          )}
          {saved && <p className="text-xs text-green-500">✓ Saved</p>}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="onboarding-git-name" className="text-sm text-fg">Name</label>
            <input
              id="onboarding-git-name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setSaved(false) }}
              className="h-8 px-2 text-sm text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="onboarding-git-email" className="text-sm text-fg">Email</label>
            <input
              id="onboarding-git-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setSaved(false) }}
              className="h-8 px-2 text-sm text-fg bg-bg border border-border rounded-lg focus:outline-none focus:border-accent/60"
            />
          </div>

          <button
            type="button"
            onClick={save}
            disabled={!name.trim() || !email.trim()}
            className="self-start h-8 px-3 rounded border border-border text-sm text-fg hover:border-fg-subtle transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            Save
          </button>
        </>
      )}
    </div>
  )
}
