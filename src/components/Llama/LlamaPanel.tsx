import { LlamaIcon } from '@/components/ActivityBar/ActivityBar'

// Placeholder panel for the upcoming llama controls (local LLM management).
// Same header chrome as the other activity-bar panels so it reads as a real
// panel the moment it appears.
export function LlamaPanel() {
  return (
    <div className="h-full flex flex-col bg-sidebar overflow-hidden">
      <div className="h-9 px-3 flex items-center justify-between border-b border-border shrink-0">
        <span className="text-xs font-semibold text-fg-muted uppercase tracking-wider truncate">
          Llama
        </span>
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-fg-subtle">
            <LlamaIcon />
          </span>
          <p className="text-xs text-fg-subtle">
            Llama controls are coming soon.
          </p>
        </div>
      </div>
    </div>
  )
}
