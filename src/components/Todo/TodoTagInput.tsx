import { useState } from 'react'
import { filterTagSuggestions } from '@/lib/todoTags'

export function TodoTagInput({
  tags,
  suggestions,
  onChange,
}: {
  tags: string[]
  suggestions: string[]
  onChange: (tags: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const matches = filterTagSuggestions(query, suggestions, tags)

  function addTag(raw: string) {
    const trimmed = raw.trim()
    if (!trimmed) return
    if (tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setQuery('')
      return
    }
    onChange([...tags, trimmed])
    setQuery('')
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(query)
    } else if (e.key === 'Backspace' && query === '' && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="todo-tags-input" className="text-xs text-fg-muted">
        Tags
      </label>
      <div className="flex flex-wrap items-center gap-1.5 bg-panel border border-border rounded px-2 py-1.5 focus-within:border-accent">
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded border border-border text-fg-subtle"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => removeTag(tag)}
              className="text-fg-subtle hover:text-fg"
            >
              ×
            </button>
          </span>
        ))}
        <input
          id="todo-tags-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? 'Add a tag…' : ''}
          className="flex-1 min-w-[80px] bg-transparent text-sm text-fg focus:outline-none"
        />
      </div>
      {matches.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {matches.map((match) => (
            <button
              key={match}
              type="button"
              onClick={() => addTag(match)}
              className="text-xs px-1.5 py-0.5 rounded border border-border/60 text-fg-subtle hover:border-accent hover:text-fg"
            >
              {match}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
