import type { Todo } from '@/types/api'

export function getProjectTags(todos: Todo[]): string[] {
  const set = new Set<string>()
  for (const todo of todos) {
    for (const tag of todo.tags) set.add(tag)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b))
}

const MAX_SUGGESTIONS = 8

export function filterTagSuggestions(query: string, suggestions: string[], excluding: string[]): string[] {
  const trimmed = query.trim().toLowerCase()
  if (!trimmed) return []
  const excludingLower = new Set(excluding.map((t) => t.toLowerCase()))
  return suggestions
    .filter((tag) => !excludingLower.has(tag.toLowerCase()) && tag.toLowerCase().includes(trimmed))
    .slice(0, MAX_SUGGESTIONS)
}
