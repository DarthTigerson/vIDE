export function WelcomeStep() {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-6">
      <h1 className="text-lg font-semibold text-fg">Welcome to vIDE</h1>
      <p className="text-sm text-fg-muted max-w-sm">
        A few quick steps to get things set up — pick a theme, choose which assistants you use,
        and take care of the macOS permission prompt up front so it doesn't keep interrupting you later.
      </p>
      <p className="text-xs text-fg-subtle">Everything here is skippable and can be changed later in Settings.</p>
    </div>
  )
}
