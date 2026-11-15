// A tool app's tools: name in mono on the left, description beside it. Shared
// by the Store app page and Settings > Agent Tooling.
export function AgentToolList({ tools, label }: { tools: { name: string; description: string }[]; label: string }) {
  return (
    <dl aria-label={label} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
      {tools.map((t) => (
        <div key={t.name} className="contents">
          <dt className="font-mono text-fg break-all">{t.name}</dt>
          <dd className="text-fg-muted">{t.description}</dd>
        </div>
      ))}
    </dl>
  )
}
